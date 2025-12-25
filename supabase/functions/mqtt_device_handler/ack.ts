/**
 * Phase 3 - ACK Module DEC25
 *
 * Publish MQTT acknowledgment messages with audit logging
 */

import type { MqttClient } from 'npm:mqtt@5.3.4';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';
import type { MissingChunksRequest, AckMessage } from './types.ts';

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
  const message: MissingChunksRequest = {
    device_id: deviceMac,
    image_name: imageName,
    missing_chunks: missingChunks,
  };

  const topic = `ESP32CAM/${deviceMac}/ack`;

  try {
    client.publish(topic, JSON.stringify(message));

    console.log('[ACK] Published missing_chunks:', {
      device: deviceMac,
      image: imageName,
      missing: missingChunks.length,
    });

    // Log to audit trail
    if (supabase) {
      await supabase.rpc('fn_log_device_ack', {
        p_device_mac: deviceMac,
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
        p_device_mac: deviceMac,
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
  const message: AckMessage = {
    device_id: deviceMac,
    image_name: imageName,
    ACK_OK: {
      next_wake_time: nextWakeTime,
    },
  };

  const topic = `ESP32CAM/${deviceMac}/ack`;

  try {
    client.publish(topic, JSON.stringify(message));

    console.log('[ACK] Published ACK_OK:', {
      device: deviceMac,
      image: imageName,
      next_wake: nextWakeTime,
    });

    // Log to audit trail
    if (supabase) {
      await supabase.rpc('fn_log_device_ack', {
        p_device_mac: deviceMac,
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
        p_device_mac: deviceMac,
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
