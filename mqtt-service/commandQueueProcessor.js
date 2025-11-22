/**
 * MQTT Command Queue Processor
 *
 * Polls device_commands table for pending commands and publishes them via MQTT
 * Handles command acknowledgment tracking and retry logic
 */

export class CommandQueueProcessor {
  constructor(supabase, mqttClient, options = {}) {
    this.supabase = supabase;
    this.mqttClient = mqttClient;
    this.pollInterval = options.pollInterval || 5000; // 5 seconds
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 30000; // 30 seconds
    this.isRunning = false;
    this.pollTimer = null;
  }

  /**
   * Start the command queue processor
   */
  start() {
    if (this.isRunning) {
      console.log('[CommandQueue] Already running');
      return;
    }

    console.log('[CommandQueue] Starting command queue processor...');
    console.log(`[CommandQueue] Poll interval: ${this.pollInterval}ms`);
    console.log(`[CommandQueue] Max retries: ${this.maxRetries}`);

    this.isRunning = true;
    this.processQueue();
  }

  /**
   * Stop the command queue processor
   */
  stop() {
    console.log('[CommandQueue] Stopping command queue processor...');
    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Main processing loop
   */
  async processQueue() {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.processPendingCommands();
      await this.retryFailedCommands();
      await this.expireOldCommands();
    } catch (error) {
      console.error('[CommandQueue] Error in process queue:', error);
    }

    // Schedule next poll
    this.pollTimer = setTimeout(() => this.processQueue(), this.pollInterval);
  }

  /**
   * Process pending commands
   */
  async processPendingCommands() {
    // Get pending commands with device info
    const { data: commands, error } = await this.supabase
      .from('device_commands')
      .select(`
        command_id,
        device_id,
        command_type,
        command_payload,
        retry_count,
        devices!inner(device_mac, device_name, is_active)
      `)
      .eq('status', 'pending')
      .eq('devices.is_active', true)
      .order('issued_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('[CommandQueue] Error fetching pending commands:', error);
      return;
    }

    if (!commands || commands.length === 0) {
      return;
    }

    console.log(`[CommandQueue] Processing ${commands.length} pending command(s)`);

    for (const command of commands) {
      await this.publishCommand(command);
    }
  }

  /**
   * Publish a command to MQTT
   */
  async publishCommand(command) {
    const deviceMac = command.devices.device_mac;
    const deviceName = command.devices.device_name || deviceMac;

    try {
      // Build MQTT payload based on command type
      const payload = this.buildCommandPayload(command, deviceMac);

      // Determine topic (per BrainlyTree PDF spec)
      const topic = `device/${deviceMac}/cmd`;

      // Publish to MQTT
      this.mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 }, async (error) => {
        if (error) {
          console.error(`[CommandQueue] Failed to publish command ${command.command_id}:`, error);

          // Mark as failed
          await this.supabase
            .from('device_commands')
            .update({
              status: 'failed',
              retry_count: command.retry_count + 1,
            })
            .eq('command_id', command.command_id);

          return;
        }

        // Mark as sent
        await this.supabase
          .from('device_commands')
          .update({
            status: 'sent',
            delivered_at: new Date().toISOString(),
          })
          .eq('command_id', command.command_id);

        console.log(`[CommandQueue] ✅ Sent ${command.command_type} to ${deviceName}`);
      });
    } catch (error) {
      console.error(`[CommandQueue] Error publishing command ${command.command_id}:`, error);

      // Mark as failed
      await this.supabase
        .from('device_commands')
        .update({
          status: 'failed',
          retry_count: command.retry_count + 1,
        })
        .eq('command_id', command.command_id);
    }
  }

  /**
   * Convert ISO 8601 timestamp to simple time format for device
   * Per BrainlyTree PDF spec: device expects "11:00PM" format in UTC
   * IMPORTANT: Device expects UTC time, NOT local time
   *
   * Examples:
   *   "2025-11-22T20:00:00.000Z" -> "8:00PM" (UTC)
   *   "2025-11-22T12:00:00.000Z" -> "12:00PM" (UTC)
   */
  formatTimeForDevice(isoTimestamp) {
    try {
      const date = new Date(isoTimestamp);

      // Use UTC methods to get UTC time (NOT local time)
      let hours = date.getUTCHours();
      const minutes = date.getUTCMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';

      // Convert to 12-hour format
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 becomes 12

      // ALWAYS include minutes with leading zero (protocol expects "12:00PM" not "12PM")
      const minuteStr = `:${minutes.toString().padStart(2, '0')}`;

      return `${hours}${minuteStr}${ampm}`;
    } catch (error) {
      console.error('[CommandQueue] Error formatting time:', error);
      return '12:00PM'; // Safe fallback
    }
  }

  /**
   * Build MQTT payload from command
   * Per BrainlyTree PDF spec (page 5): Messages should ONLY contain device_id and command fields
   */
  buildCommandPayload(command, deviceMac) {
    // Add command-specific fields per BrainlyTree PDF spec
    switch (command.command_type) {
      case 'capture_image':
        return {
          device_id: deviceMac,
          capture_image: true,
        };

      case 'send_image':
        return {
          device_id: deviceMac,
          send_image: command.command_payload?.image_name,
        };

      case 'set_wake_schedule':
        // Convert ISO timestamp to simple time format (e.g., "11:00PM")
        const nextWakeISO = command.command_payload?.next_wake_time;
        const nextWakeSimple = nextWakeISO ? this.formatTimeForDevice(nextWakeISO) : '12:00PM';
        console.log(`[CommandQueue] Converting wake time: ${nextWakeISO} -> ${nextWakeSimple}`);
        return {
          device_id: deviceMac,
          next_wake: nextWakeSimple, // Simple time format only
        };

      case 'update_config':
        return {
          device_id: deviceMac,
          ...command.command_payload,
        };

      case 'reboot':
        return {
          device_id: deviceMac,
          reboot: true,
        };

      case 'update_firmware':
        return {
          device_id: deviceMac,
          firmware_url: command.command_payload?.firmware_url,
        };

      default:
        return {
          device_id: deviceMac,
          ...command.command_payload,
        };
    }
  }

  /**
   * Retry failed commands
   */
  async retryFailedCommands() {
    const retryAfter = new Date(Date.now() - this.retryDelay).toISOString();

    const { data: commands, error } = await this.supabase
      .from('device_commands')
      .select(`
        command_id,
        device_id,
        command_type,
        command_payload,
        retry_count,
        devices!inner(device_mac, device_name, is_active)
      `)
      .eq('status', 'failed')
      .eq('devices.is_active', true)
      .lt('retry_count', this.maxRetries)
      .lt('delivered_at', retryAfter)
      .order('issued_at', { ascending: true })
      .limit(10);

    if (error) {
      console.error('[CommandQueue] Error fetching failed commands:', error);
      return;
    }

    if (!commands || commands.length === 0) {
      return;
    }

    console.log(`[CommandQueue] Retrying ${commands.length} failed command(s)`);

    for (const command of commands) {
      // Reset to pending for retry
      await this.supabase
        .from('device_commands')
        .update({
          status: 'pending',
        })
        .eq('command_id', command.command_id);

      await this.publishCommand(command);
    }
  }

  /**
   * Expire old pending commands
   */
  async expireOldCommands() {
    const expireAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    const { data, error } = await this.supabase
      .from('device_commands')
      .update({
        status: 'expired',
      })
      .eq('status', 'pending')
      .lt('issued_at', expireAfter)
      .select('command_id');

    if (error) {
      console.error('[CommandQueue] Error expiring old commands:', error);
      return;
    }

    if (data && data.length > 0) {
      console.log(`[CommandQueue] Expired ${data.length} old command(s)`);
    }
  }

  /**
   * Handle command acknowledgment from device
   */
  async handleCommandAck(deviceMac, ackPayload) {
    // Find the most recent sent command for this device
    const { data: command, error } = await this.supabase
      .from('device_commands')
      .select('command_id, command_type')
      .eq('devices.device_mac', deviceMac)
      .eq('status', 'sent')
      .order('delivered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[CommandQueue] Error finding command for ACK:', error);
      return;
    }

    if (!command) {
      console.log('[CommandQueue] No sent command found for ACK');
      return;
    }

    // Mark as acknowledged
    await this.supabase
      .from('device_commands')
      .update({
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
      })
      .eq('command_id', command.command_id);

    console.log(`[CommandQueue] ✅ Command ${command.command_type} acknowledged by device`);
  }

  /**
   * Queue a new command
   */
  async queueCommand(deviceId, commandType, commandPayload, userId = null) {
    const { data, error } = await this.supabase
      .from('device_commands')
      .insert({
        device_id: deviceId,
        command_type: commandType,
        command_payload: commandPayload,
        status: 'pending',
        created_by_user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[CommandQueue] Error queueing command:', error);
      return { success: false, error };
    }

    console.log(`[CommandQueue] Queued ${commandType} command for device ${deviceId}`);
    return { success: true, command: data };
  }

  /**
   * Send welcome command to newly-mapped device
   */
  async sendWelcomeCommand(deviceId, siteId, programId, wakeScheduleCron) {
    console.log(`[CommandQueue] Sending welcome command to device ${deviceId}`);

    // Calculate next wake time
    const { data: nextWake } = await this.supabase.rpc('fn_calculate_next_wake', {
      p_cron_expression: wakeScheduleCron,
      p_from_timestamp: new Date().toISOString(),
    });

    // Queue welcome command with site context
    return await this.queueCommand(
      deviceId,
      'set_wake_schedule',
      {
        next_wake_time: nextWake || new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        welcome: true,
        site_id: siteId,
        program_id: programId,
      },
      null // System-generated
    );
  }
}
