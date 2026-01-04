import { supabase } from '../lib/supabaseClient';
import { Device } from '../lib/types';
import { createLogger } from '../utils/logger';
import { withRetry } from '../lib/api';

const logger = createLogger('DeviceService');

export interface DeviceRegistrationData {
  deviceMac: string;
  deviceCode?: string;
  deviceName?: string;
  hardwareVersion?: string;
  firmwareVersion?: string;
  notes?: string;
}

export interface DeviceTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  lastSeen?: string;
}

export interface BulkDeviceImport {
  deviceMac: string;
  deviceName?: string;
  hardwareVersion?: string;
  notes?: string;
}

export class DeviceService {
  /**
   * Generate a unique device code
   */
  static async generateDeviceCode(hardwareVersion: string = 'ESP32-S3'): Promise<string> {
    // Format: DEVICE-{HARDWARE}-{SEQUENCE}
    const prefix = hardwareVersion.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    // Get the count of existing devices with this hardware version
    const { count } = await supabase
      .from('devices')
      .select('device_id', { count: 'exact', head: true })
      .ilike('device_code', `DEVICE-${prefix}-%`);

    const sequence = String((count || 0) + 1).padStart(3, '0');
    return `DEVICE-${prefix}-${sequence}`;
  }

  /**
   * Validate device code format and uniqueness
   */
  static async validateDeviceCode(deviceCode: string): Promise<{ valid: boolean; error?: string }> {
    // Check format: must be alphanumeric with hyphens, no spaces
    if (!/^[A-Z0-9-]+$/i.test(deviceCode)) {
      return {
        valid: false,
        error: 'Device code must contain only letters, numbers, and hyphens'
      };
    }

    // Check uniqueness
    const { data: existingDevice } = await supabase
      .from('devices')
      .select('device_id')
      .eq('device_code', deviceCode)
      .maybeSingle();

    if (existingDevice) {
      return {
        valid: false,
        error: 'Device code already exists'
      };
    }

    return { valid: true };
  }

  /**
   * Register a new device (manual provisioning)
   */
  static async registerDevice(data: DeviceRegistrationData): Promise<{ device: Device | null; error: string | null }> {
    logger.debug('Registering new device', { mac: data.deviceMac });

    try {
      // Check if device with this MAC already exists
      const { data: existingDevice } = await supabase
        .from('devices')
        .select('device_id, device_mac')
        .eq('device_mac', data.deviceMac)
        .maybeSingle();

      if (existingDevice) {
        return {
          device: null,
          error: `Device with MAC address ${data.deviceMac} already exists`
        };
      }

      // Generate or validate device code
      let deviceCode = data.deviceCode;
      if (deviceCode) {
        const validation = await this.validateDeviceCode(deviceCode);
        if (!validation.valid) {
          return { device: null, error: validation.error || 'Invalid device code' };
        }
      } else {
        deviceCode = await this.generateDeviceCode(data.hardwareVersion || 'ESP32-S3');
      }

      // Get current user for provisioning tracking
      const { data: { user } } = await supabase.auth.getUser();

      // Create the device
      const result = await withRetry(() =>
        supabase
          .from('devices')
          .insert({
            device_mac: data.deviceMac,
            device_code: deviceCode,
            device_name: data.deviceName || null,
            hardware_version: data.hardwareVersion || 'ESP32-S3',
            firmware_version: data.firmwareVersion || null,
            provisioning_status: 'pending_mapping',
            provisioned_at: new Date().toISOString(),
            provisioned_by_user_id: user?.id || null,
            notes: data.notes || null,
            is_active: false
          })
          .select()
          .single()
      , 'registerDevice');

      if (result.error) {
        logger.error('Failed to register device', result.error);
        return { device: null, error: result.error.message };
      }

      logger.info('Device registered successfully', { deviceId: result.data.device_id, deviceCode });
      return { device: result.data as Device, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in registerDevice', { error: errorMessage });
      return { device: null, error: errorMessage };
    }
  }

  /**
   * Register multiple devices from bulk import
   */
  static async bulkRegisterDevices(devices: BulkDeviceImport[]): Promise<{
    successful: Device[];
    failed: Array<{ mac: string; error: string }>;
  }> {
    logger.debug('Bulk registering devices', { count: devices.length });

    const successful: Device[] = [];
    const failed: Array<{ mac: string; error: string }> = [];

    const { data: { user } } = await supabase.auth.getUser();

    for (const deviceData of devices) {
      try {
        const { data: existingDevice } = await supabase
          .from('devices')
          .select('device_id')
          .eq('device_mac', deviceData.deviceMac)
          .maybeSingle();

        if (existingDevice) {
          failed.push({
            mac: deviceData.deviceMac,
            error: 'Device already exists'
          });
          continue;
        }

        const result = await supabase
          .from('devices')
          .insert({
            device_mac: deviceData.deviceMac,
            device_name: deviceData.deviceName || null,
            hardware_version: deviceData.hardwareVersion || 'ESP32-S3',
            provisioning_status: 'pending_mapping',
            provisioned_at: new Date().toISOString(),
            provisioned_by_user_id: user?.id || null,
            notes: deviceData.notes || null,
            is_active: false
          })
          .select()
          .single();

        if (result.error) {
          failed.push({
            mac: deviceData.deviceMac,
            error: result.error.message
          });
        } else {
          successful.push(result.data as Device);
        }
      } catch (error) {
        failed.push({
          mac: deviceData.deviceMac,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info('Bulk registration completed', {
      successful: successful.length,
      failed: failed.length
    });

    return { successful, failed };
  }

  /**
   * Test device connectivity via MQTT ping command
   * Sends a ping command that will be delivered when device wakes up
   */
  static async testDeviceConnection(deviceId: string): Promise<DeviceTestResult> {
    logger.debug('Testing device connection', { deviceId });

    try {
      const startTime = Date.now();

      // Check if device exists
      const { data: device, error } = await supabase
        .from('devices')
        .select('last_seen_at, device_mac, device_code, is_active, wake_schedule_cron')
        .eq('device_id', deviceId)
        .single();

      if (error || !device) {
        return {
          success: false,
          message: 'Device not found'
        };
      }

      // Issue a ping command
      const { data: { user } } = await supabase.auth.getUser();

      const { data: command, error: commandError } = await supabase
        .from('device_commands')
        .insert({
          device_id: deviceId,
          command_type: 'ping',
          command_payload: { timestamp: new Date().toISOString() },
          created_by_user_id: user?.id || null,
          notes: 'Connection test ping'
        })
        .select()
        .single();

      if (commandError) {
        logger.error('Failed to create ping command', commandError);
        return {
          success: false,
          message: 'Failed to send ping command: ' + commandError.message
        };
      }

      const latencyMs = Date.now() - startTime;

      // Return based on last seen time
      if (!device.last_seen_at) {
        return {
          success: true,
          message: 'Ping command queued. Device has never connected - waiting for first connection.',
          latencyMs
        };
      }

      const lastSeenDate = new Date(device.last_seen_at);
      const minutesSinceLastSeen = (Date.now() - lastSeenDate.getTime()) / (1000 * 60);

      if (minutesSinceLastSeen < 5) {
        return {
          success: true,
          message: 'Ping command sent! Device is online and will respond shortly.',
          latencyMs,
          lastSeen: device.last_seen_at
        };
      } else {
        return {
          success: true,
          message: `Ping command queued. Device will respond at next wake (last seen ${Math.floor(minutesSinceLastSeen)} min ago).`,
          latencyMs,
          lastSeen: device.last_seen_at
        };
      }
    } catch (error) {
      logger.error('Error testing device connection', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed'
      };
    }
  }

  /**
   * Update device settings and queue command for next wake
   */
  static async updateDeviceSettings(params: {
    deviceId: string;
    wakeScheduleCron?: string;
    deviceName?: string;
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> {
    logger.debug('Updating device settings', params);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Calculate next wake time FIRST if wake schedule is changing
      let nextWakeTime: string | null = null;
      if (params.wakeScheduleCron !== undefined) {
        // Calculate from current time (NOW())
        const { data: calculatedWake, error: rpcError } = await supabase.rpc(
          'fn_calculate_next_wake',
          {
            p_cron_expression: params.wakeScheduleCron,
            p_from_timestamp: new Date().toISOString() // Calculate from NOW
          }
        );

        if (rpcError) {
          logger.error('Failed to calculate next wake time', rpcError);
          return { success: false, error: 'Failed to calculate next wake time: ' + rpcError.message };
        }

        nextWakeTime = calculatedWake || new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(); // 3hr fallback
        logger.debug('Calculated next wake time from NOW()', { nextWakeTime, cron: params.wakeScheduleCron });
      }

      // Update device record - include next_wake_at if calculated
      const updates: any = {
        updated_at: new Date().toISOString(),
        last_updated_by_user_id: user?.id || null,
      };

      if (params.wakeScheduleCron !== undefined) {
        updates.wake_schedule_cron = params.wakeScheduleCron;
        updates.next_wake_at = nextWakeTime; // Update next wake time in DB
      }
      if (params.deviceName !== undefined) updates.device_name = params.deviceName;
      if (params.notes !== undefined) updates.notes = params.notes;

      const { error: updateError } = await supabase
        .from('devices')
        .update(updates)
        .eq('device_id', params.deviceId);

      if (updateError) {
        logger.error('Failed to update device', updateError);
        return { success: false, error: updateError.message };
      }

      // Queue set_wake_schedule command for device IF wake schedule changed
      if (params.wakeScheduleCron !== undefined && nextWakeTime) {
        // Per BrainlyTree protocol: ONLY send next_wake_time, NOT cron
        // MQTT service will convert ISO timestamp to simple time format (e.g., "11:00PM")
        const { error: commandError } = await supabase
          .from('device_commands')
          .insert({
            device_id: params.deviceId,
            command_type: 'set_wake_schedule',
            command_payload: {
              next_wake_time: nextWakeTime // ISO timestamp - MQTT service converts to simple time
            },
            created_by_user_id: user?.id || null,
            notes: 'Wake schedule updated via UI'
          });

        if (commandError) {
          logger.error('Failed to queue wake schedule command', commandError);
          return { success: false, error: 'Settings updated but command failed: ' + commandError.message };
        }

        logger.info('Wake schedule updated in DB and command queued', {
          deviceId: params.deviceId,
          nextWakeTime,
          cron: params.wakeScheduleCron
        });
      }

      logger.info('Device settings updated successfully', params);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in updateDeviceSettings', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Validate MAC address format
   */
  static validateMacAddress(mac: string): { valid: boolean; formatted?: string; error?: string } {
    // Remove any spaces, dashes, or colons
    const cleanMac = mac.replace(/[\s\-:]/g, '').toUpperCase();

    // Check if it's 12 hex characters
    if (!/^[0-9A-F]{12}$/.test(cleanMac)) {
      return {
        valid: false,
        error: 'MAC address must be 12 hexadecimal characters (e.g., B8F862F9CFB8 or B8:F8:62:F9:CF:B8)'
      };
    }

    // Format with colons (AA:BB:CC:DD:EE:FF)
    const formatted = cleanMac.match(/.{1,2}/g)?.join(':') || cleanMac;

    return { valid: true, formatted };
  }

  /**
   * Get user-friendly wake schedule presets
   */
  static getWakeSchedulePresets(): Array<{
    label: string;
    interval_hours: number;
    cron: string;
    description: string;
  }> {
    return [
      {
        label: 'Every 3 hours',
        interval_hours: 3,
        cron: '0 */3 * * *',
        description: '8 times per day'
      },
      {
        label: 'Every 6 hours',
        interval_hours: 6,
        cron: '0 */6 * * *',
        description: '4 times per day'
      },
      {
        label: 'Every 12 hours',
        interval_hours: 12,
        cron: '0 */12 * * *',
        description: '2 times per day'
      },
      {
        label: 'Once daily at 8am',
        interval_hours: 24,
        cron: '0 8 * * *',
        description: 'Single daily check'
      },
      {
        label: 'Twice daily (8am & 8pm)',
        interval_hours: 12,
        cron: '0 8,20 * * *',
        description: 'Morning and evening'
      },
      {
        label: 'Three times daily (8am, 2pm, 8pm)',
        interval_hours: 8,
        cron: '0 8,14,20 * * *',
        description: 'Throughout the day'
      },
    ];
  }

  /**
   * Get recommended wake schedule based on site type
   * @deprecated Use getWakeSchedulePresets() instead
   */
  static getRecommendedWakeSchedule(siteType?: string): {
    label: string;
    cron: string;
    description: string;
  }[] {
    const presets = this.getWakeSchedulePresets();
    return presets.map(p => ({
      label: p.label,
      cron: p.cron,
      description: p.description
    }));
  }

  /**
   * Calculate next wake time based on cron schedule
   * @deprecated Use database RPC fn_calculate_next_wake_time for accurate calculation
   */
  static calculateNextWake(cronExpression: string): Date | null {
    // This is a simplified calculation
    // In production, use database RPC function for accurate timezone-aware calculation
    try {
      const now = new Date();

      // Parse simple patterns like "0 8,16 * * *" (twice daily)
      const parts = cronExpression.split(' ');
      if (parts.length !== 5) return null;

      const hours = parts[1];
      if (hours.includes(',')) {
        const hoursList = hours.split(',').map(h => parseInt(h));
        const currentHour = now.getHours();

        // Find next hour
        const nextHour = hoursList.find(h => h > currentHour);
        if (nextHour !== undefined) {
          const next = new Date(now);
          next.setHours(nextHour, 0, 0, 0);
          return next;
        } else {
          // Next day, first hour
          const next = new Date(now);
          next.setDate(next.getDate() + 1);
          next.setHours(hoursList[0], 0, 0, 0);
          return next;
        }
      }

      return null;
    } catch (error) {
      logger.error('Error calculating next wake', error);
      return null;
    }
  }

  /**
   * Preview wake schedule changes with estimated next wake times
   */
  static async previewWakeSchedule(params: {
    deviceId: string;
    newCron: string;
  }): Promise<{
    current_next_wake: string | null;
    new_next_wake_after_current: string | null;
    interval_description: string;
  }> {
    try {
      // Get device's current next_wake_at and timezone
      const { data: device } = await supabase
        .from('devices')
        .select(`
          next_wake_at,
          last_wake_at,
          device_site_assignments!inner(
            sites(
              timezone
            )
          )
        `)
        .eq('device_id', params.deviceId)
        .eq('device_site_assignments.is_active', true)
        .maybeSingle();

      if (!device) {
        return {
          current_next_wake: null,
          new_next_wake_after_current: null,
          interval_description: 'Device not found'
        };
      }

      // Get timezone from site
      const timezone = (device.device_site_assignments?.[0] as any)?.sites?.timezone || 'America/New_York';

      // Calculate what next wake would be AFTER current expected wake
      // (device will get new schedule at current_next_wake)
      const { data: calculatedNextWake } = await supabase.rpc(
        'fn_calculate_next_wake_time',
        {
          p_last_wake_at: device.next_wake_at || device.last_wake_at || new Date().toISOString(),
          p_cron_expression: params.newCron,
          p_timezone: timezone
        }
      );

      // Parse cron for human description
      let description = 'Custom schedule';
      const hourPart = params.newCron.split(' ')[1];
      if (hourPart?.includes('*/')) {
        const hours = hourPart.replace('*/', '');
        description = `Every ${hours} hours`;
      } else if (hourPart?.includes(',')) {
        const times = hourPart.split(',').length;
        description = `${times} times per day`;
      } else if (hourPart && !hourPart.includes('*')) {
        description = `Once daily at ${hourPart}:00`;
      }

      return {
        current_next_wake: device.next_wake_at,
        new_next_wake_after_current: calculatedNextWake,
        interval_description: description
      };
    } catch (error) {
      logger.error('Error previewing wake schedule', error);
      return {
        current_next_wake: null,
        new_next_wake_after_current: null,
        interval_description: 'Error calculating preview'
      };
    }
  }

  /**
   * Get next wake times for a device
   */
  static async getNextWakeTimes(params: {
    deviceId: string;
    count?: number;
  }): Promise<{
    wake_times: string[];
    timezone: string;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase.rpc('get_next_wake_times', {
        p_device_id: params.deviceId,
        p_count: params.count || 3
      });

      if (error) {
        logger.error('Failed to get next wake times', error);
        return {
          wake_times: [],
          timezone: 'UTC',
          error: error.message
        };
      }

      if (!data) {
        return {
          wake_times: [],
          timezone: 'UTC',
          error: 'No data returned'
        };
      }

      return {
        wake_times: data.wake_times || [],
        timezone: data.timezone || 'UTC',
        error: data.error
      };
    } catch (error) {
      logger.error('Error getting next wake times', error);
      return {
        wake_times: [],
        timezone: 'UTC',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get device setup progress
   */
  static calculateSetupProgress(device: Device): {
    percentage: number;
    steps: Array<{ label: string; completed: boolean; required: boolean }>;
  } {
    const steps = [
      {
        label: 'Device Registered',
        completed: !!device.device_id,
        required: true
      },
      {
        label: 'Device Named',
        completed: !!device.device_name,
        required: false
      },
      {
        label: 'Assigned to Program',
        completed: !!device.program_id,
        required: true
      },
      {
        label: 'Assigned to Site',
        completed: !!device.site_id,
        required: true
      },
      {
        label: 'Wake Schedule Set',
        completed: !!device.wake_schedule_cron,
        required: true
      },
      {
        label: 'Device Activated',
        completed: device.is_active === true,
        required: true
      },
      {
        label: 'First Connection',
        completed: !!device.last_seen_at,
        required: false
      }
    ];

    const requiredSteps = steps.filter(s => s.required);
    const completedRequired = requiredSteps.filter(s => s.completed).length;
    const percentage = Math.round((completedRequired / requiredSteps.length) * 100);

    return { percentage, steps };
  }

  /**
   * Assign device to a site (creates junction table entry)
   */
  static async assignDeviceToSite(params: {
    deviceId: string;
    siteId: string;
    programId: string;
    isPrimary?: boolean;
    reason?: string;
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> {
    logger.debug('Assigning device to site', params);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('device_site_assignments')
        .insert({
          device_id: params.deviceId,
          site_id: params.siteId,
          program_id: params.programId,
          is_primary: params.isPrimary ?? true,
          is_active: true,
          assigned_by_user_id: user?.id || null,
          reason: params.reason || null,
          notes: params.notes || null
        });

      if (error) {
        logger.error('Failed to assign device to site', error);
        return { success: false, error: error.message };
      }

      logger.info('Device assigned to site successfully', params);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in assignDeviceToSite', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Unassign device from a site (marks assignment as inactive)
   */
  static async unassignDeviceFromSite(params: {
    assignmentId: string;
    reason?: string;
  }): Promise<{ success: boolean; error?: string }> {
    logger.debug('Unassigning device from site', params);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('device_site_assignments')
        .update({
          is_active: false,
          unassigned_at: new Date().toISOString(),
          unassigned_by_user_id: user?.id || null,
          reason: params.reason || null
        })
        .eq('assignment_id', params.assignmentId);

      if (error) {
        logger.error('Failed to unassign device from site', error);
        return { success: false, error: error.message };
      }

      logger.info('Device unassigned from site successfully', params);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in unassignDeviceFromSite', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get all assignments for a device
   */
  static async getDeviceAssignments(deviceId: string): Promise<{
    siteAssignments: any[];
    programAssignments: any[];
    error?: string;
  }> {
    logger.debug('Getting device assignments', { deviceId });

    try {
      const [siteResult, programResult] = await Promise.all([
        supabase
          .from('device_site_assignments')
          .select('*, sites(site_id, name, type, site_code), pilot_programs(program_id, name)')
          .eq('device_id', deviceId)
          .order('assigned_at', { ascending: false }),
        supabase
          .from('device_program_assignments')
          .select('*, pilot_programs(program_id, name)')
          .eq('device_id', deviceId)
          .order('assigned_at', { ascending: false })
      ]);

      if (siteResult.error) {
        logger.error('Failed to get site assignments', siteResult.error);
        return { siteAssignments: [], programAssignments: [], error: siteResult.error.message };
      }

      if (programResult.error) {
        logger.error('Failed to get program assignments', programResult.error);
        return { siteAssignments: [], programAssignments: [], error: programResult.error.message };
      }

      return {
        siteAssignments: siteResult.data || [],
        programAssignments: programResult.data || []
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in getDeviceAssignments', { error: errorMessage });
      return { siteAssignments: [], programAssignments: [], error: errorMessage };
    }
  }

  /**
   * Delete a device (FOR TESTING ONLY - will be removed in production)
   * This will cascade delete all related records
   */
  static async deleteDevice(deviceId: string): Promise<{ success: boolean; error?: string }> {
    logger.warn('DELETING DEVICE - TESTING ONLY', { deviceId });

    try {
      const { error } = await supabase
        .from('devices')
        .delete()
        .eq('device_id', deviceId);

      if (error) {
        logger.error('Failed to delete device', error);
        return {
          success: false,
          error: error.message
        };
      }

      logger.info('Device deleted successfully', { deviceId });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error deleting device', { error: errorMessage });
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}
