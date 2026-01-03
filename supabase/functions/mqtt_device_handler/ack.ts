/**
 * Phase 3 - Command Publishing Module
 *
 * Publish MQTT commands and acknowledgments to devices following the ESP32-CAM protocol
 *
 * Protocol Flow:
 * 1. Device sends HELLO -> Server sends ACK
 * 2. Server sends SNAP command -> Device captures and sends metadata
 * 3. Device sends chunks -> Server assembles image
 * 4. Server sends SLEEP with next_wake_time -> Device sleeps
 */

import type { MqttClient } from 'npm:mqtt@5.3.4';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';
import type { MissingChunksRequest, AckMessage } from './types.ts';
import { normalizeMacAddress } from './utils.ts';
import { PROTOCOL_FIELDS, PROTOCOL_TOPICS, formatNextWakeTime } from './protocol.ts';

/**
 * Publish missing chunks request to device
 */
export async function publishMissingChunks(
  client: MqttClient,
  deviceMac: string,
  imageName: string,
  missingChunks: number[],
  supabase?: SupabaseClient
): Promise<void> {
  // Normalize MAC address (remove separators, uppercase)
  const normalizedMac = normalizeMacAddress(deviceMac);
  if (!normalizedMac) {
    console.error('[ACK] Invalid MAC address format:', deviceMac);
    return;
  }

  const message: MissingChunksRequest = {
    device_id: normalizedMac,
    image_name: imageName,
    missing_chunks: missingChunks,
  };

  const topic = `ESP32CAM/${normalizedMac}/ack`;

  try {
    client.publish(topic, JSON.stringify(message));

    console.log('[ACK] Published missing_chunks:', {
      device: normalizedMac,
      image: imageName,
      missing: missingChunks.length,
    });

    // Log to audit trail
    if (supabase) {
      await supabase.rpc('fn_log_device_ack', {
        p_device_mac: normalizedMac,
        p_image_name: imageName,
        p_ack_type: 'MISSING_CHUNKS',
        p_mqtt_topic: topic,
        p_mqtt_payload: message,
        p_missing_chunks: missingChunks,
        p_mqtt_success: true,
      });
    }
  } catch (err) {
    console.error('[ACK] Failed to publish missing_chunks:', err);

    // Log failure to audit trail
    if (supabase) {
      await supabase.rpc('fn_log_device_ack', {
        p_device_mac: normalizedMac,
        p_image_name: imageName,
        p_ack_type: 'MISSING_CHUNKS',
        p_mqtt_topic: topic,
        p_mqtt_payload: message,
        p_missing_chunks: missingChunks,
        p_mqtt_success: false,
        p_mqtt_error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Publish ACK_OK with next wake time
 */
export async function publishAckOk(
  client: MqttClient,
  deviceMac: string,
  imageName: string,
  nextWakeTime: string,
  supabase?: SupabaseClient
): Promise<void> {
  // Normalize MAC address (remove separators, uppercase)
  const normalizedMac = normalizeMacAddress(deviceMac);
  if (!normalizedMac) {
    console.error('[ACK] Invalid MAC address format:', deviceMac);
    return;
  }

  const message: AckMessage = {
    device_id: normalizedMac,
    image_name: imageName,
    ACK_OK: {
      next_wake_time: nextWakeTime,
    },
  };

  const topic = `ESP32CAM/${normalizedMac}/ack`;

  try {
    client.publish(topic, JSON.stringify(message));

    console.log('[ACK] Published ACK_OK:', {
      device: normalizedMac,
      image: imageName,
      next_wake: nextWakeTime,
    });

    // Log to audit trail
    if (supabase) {
      await supabase.rpc('fn_log_device_ack', {
        p_device_mac: normalizedMac,
        p_image_name: imageName,
        p_ack_type: 'ACK_OK',
        p_mqtt_topic: topic,
        p_mqtt_payload: message,
        p_next_wake_time: nextWakeTime,
        p_mqtt_success: true,
      });
    }
  } catch (err) {
    console.error('[ACK] Failed to publish ACK_OK:', err);

    // Log failure to audit trail
    if (supabase) {
      await supabase.rpc('fn_log_device_ack', {
        p_device_mac: normalizedMac,
        p_image_name: imageName,
        p_ack_type: 'ACK_OK',
        p_mqtt_topic: topic,
        p_mqtt_payload: message,
        p_next_wake_time: nextWakeTime,
        p_mqtt_success: false,
        p_mqtt_error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Publish SNAP command to device
 * Tells device to capture an image with the specified name
 */
export async function publishSnapCommand(
  client: MqttClient | null,
  deviceMac: string,
  imageName: string,
  supabase: SupabaseClient,
  payloadId?: string
): Promise<void> {
  const normalizedMac = normalizeMacAddress(deviceMac);
  if (!normalizedMac) {
    console.error('[CMD] Invalid MAC address format:', deviceMac);
    return;
  }

  const message = {
    [PROTOCOL_FIELDS.DEVICE_ID]: normalizedMac,
    [PROTOCOL_FIELDS.SEND_IMAGE]: imageName,
  };

  const topic = PROTOCOL_TOPICS.CMD(normalizedMac);

  console.log('[CMD] Sending SNAP command:', {
    device: normalizedMac,
    image: imageName,
    topic,
  });

  // Update wake payload state
  if (payloadId) {
    await supabase
      .from('device_wake_payloads')
      .update({
        protocol_state: 'snap_sent',
        snap_sent_at: new Date().toISOString(),
        server_image_name: imageName,
      })
      .eq('payload_id', payloadId);
  }

  // In HTTP mode, there's no MQTT client - we just track state
  if (!client) {
    console.log('[CMD] HTTP mode - SNAP command tracked in database only');
    return;
  }

  try {
    client.publish(topic, JSON.stringify(message));
    console.log('[CMD] SNAP command published successfully');
  } catch (err) {
    console.error('[CMD] Failed to publish SNAP command:', err);
  }
}

/**
 * Publish SLEEP command to device with next wake time
 * Tells device to go to sleep and wake at specified time
 */
export async function publishSleepCommand(
  client: MqttClient | null,
  deviceMac: string,
  nextWakeTime: string,
  supabase: SupabaseClient,
  payloadId?: string
): Promise<void> {
  const normalizedMac = normalizeMacAddress(deviceMac);
  if (!normalizedMac) {
    console.error('[CMD] Invalid MAC address format:', deviceMac);
    return;
  }

  const message = {
    [PROTOCOL_FIELDS.DEVICE_ID]: normalizedMac,
    [PROTOCOL_FIELDS.NEXT_WAKE]: nextWakeTime,
  };

  const topic = PROTOCOL_TOPICS.CMD(normalizedMac);

  console.log('[CMD] Sending SLEEP command:', {
    device: normalizedMac,
    next_wake: nextWakeTime,
    topic,
  });

  // Update wake payload state
  if (payloadId) {
    await supabase
      .from('device_wake_payloads')
      .update({
        protocol_state: 'complete',
        sleep_sent_at: new Date().toISOString(),
        is_complete: true,
      })
      .eq('payload_id', payloadId);
  }

  // In HTTP mode, there's no MQTT client - we just track state
  if (!client) {
    console.log('[CMD] HTTP mode - SLEEP command tracked in database only');
    return;
  }

  try {
    client.publish(topic, JSON.stringify(message));
    console.log('[CMD] SLEEP command published successfully');
  } catch (err) {
    console.error('[CMD] Failed to publish SLEEP command:', err);
  }
}

/**
 * Calculate next wake time based on device and site schedules
 * Inherits from site if device has no schedule
 */
export async function calculateNextWake(
  supabase: SupabaseClient,
  deviceId: string,
  siteId: string | null,
  timezone: string
): Promise<Date | null> {
  // Get device schedule
  const { data: device } = await supabase
    .from('devices')
    .select('wake_schedule_cron, last_wake_at')
    .eq('device_id', deviceId)
    .single();

  if (!device) {
    console.error('[CMD] Device not found:', deviceId);
    return null;
  }

  let scheduleToUse = device.wake_schedule_cron;

  // Inherit site schedule if device has none
  if (!scheduleToUse && siteId) {
    const { data: site } = await supabase
      .from('sites')
      .select('wake_schedule_cron')
      .eq('site_id', siteId)
      .single();

    if (site?.wake_schedule_cron) {
      scheduleToUse = site.wake_schedule_cron;
      console.log('[CMD] Device inheriting site wake schedule');
    }
  }

  if (!scheduleToUse) {
    console.log('[CMD] No wake schedule found for device or site');
    return null;
  }

  // Calculate next wake using existing function
  const { data: nextWake, error } = await supabase.rpc('fn_calculate_next_wake_time', {
    p_last_wake_at: device.last_wake_at || new Date().toISOString(),
    p_cron_expression: scheduleToUse,
    p_timezone: timezone,
  });

  if (error) {
    console.error('[CMD] Error calculating next wake:', error);
    return null;
  }

  return nextWake ? new Date(nextWake) : null;
}
