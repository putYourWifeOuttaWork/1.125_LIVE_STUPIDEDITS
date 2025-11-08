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
   * Test device connectivity via MQTT
   */
  static async testDeviceConnection(deviceId: string): Promise<DeviceTestResult> {
    logger.debug('Testing device connection', { deviceId });

    try {
      const startTime = Date.now();

      // Check device's last seen timestamp
      const { data: device, error } = await supabase
        .from('devices')
        .select('last_seen_at, device_mac, is_active')
        .eq('device_id', deviceId)
        .single();

      if (error || !device) {
        return {
          success: false,
          message: 'Device not found'
        };
      }

      if (!device.last_seen_at) {
        return {
          success: false,
          message: 'Device has never connected. Please ensure device is powered on and has WiFi connectivity.'
        };
      }

      const lastSeenDate = new Date(device.last_seen_at);
      const now = new Date();
      const minutesSinceLastSeen = (now.getTime() - lastSeenDate.getTime()) / (1000 * 60);
      const latencyMs = Date.now() - startTime;

      if (minutesSinceLastSeen < 5) {
        return {
          success: true,
          message: 'Device is online and responsive',
          latencyMs,
          lastSeen: device.last_seen_at
        };
      } else if (minutesSinceLastSeen < 120) {
        return {
          success: true,
          message: `Device was last seen ${Math.floor(minutesSinceLastSeen)} minutes ago`,
          latencyMs,
          lastSeen: device.last_seen_at
        };
      } else {
        return {
          success: false,
          message: `Device appears offline. Last seen: ${lastSeenDate.toLocaleString()}`,
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
   * Get recommended wake schedule based on site type
   */
  static getRecommendedWakeSchedule(siteType?: string): {
    label: string;
    cron: string;
    description: string;
  }[] {
    const schedules = [
      {
        label: 'Twice Daily (8am & 4pm)',
        cron: '0 8,16 * * *',
        description: 'Standard monitoring schedule for most sites'
      },
      {
        label: 'Three Times Daily (8am, 2pm & 8pm)',
        cron: '0 8,14,20 * * *',
        description: 'Increased monitoring for high-activity areas'
      },
      {
        label: 'Once Daily (8am)',
        cron: '0 8 * * *',
        description: 'Light monitoring for low-risk areas'
      },
      {
        label: 'Every 6 Hours',
        cron: '0 */6 * * *',
        description: 'Intensive monitoring for critical areas'
      },
      {
        label: 'Business Hours Only (9am-5pm, hourly)',
        cron: '0 9-17 * * *',
        description: 'Active monitoring during work hours'
      }
    ];

    // Reorder based on site type if provided
    if (siteType === 'petri') {
      return schedules;
    }

    return schedules;
  }

  /**
   * Calculate next wake time based on cron schedule
   */
  static calculateNextWake(cronExpression: string): Date | null {
    // This is a simplified calculation
    // In production, you'd use a proper cron parser library
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
        completed: device.is_active && device.provisioning_status === 'active',
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
}
