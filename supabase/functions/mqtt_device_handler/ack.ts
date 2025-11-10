/**
 * Phase 3 - ACK Module
 * 
 * Publish MQTT acknowledgment messages
 */

import type { MqttClient } from 'npm:mqtt@5.3.4';
import type { MissingChunksRequest, AckMessage } from './types.ts';

/**
 * Publish missing chunks request to device
 */
export function publishMissingChunks(
  client: MqttClient,
  deviceMac: string,
  imageName: string,
  missingChunks: number[]
): void {
  const message: MissingChunksRequest = {
    device_id: deviceMac,
    image_name: imageName,
    missing_chunks: missingChunks,
  };

  const topic = `device/${deviceMac}/ack`;
  client.publish(topic, JSON.stringify(message));
  
  console.log('[ACK] Published missing_chunks:', {
    device: deviceMac,
    image: imageName,
    missing: missingChunks.length,
  });
}

/**
 * Publish ACK_OK with next wake time
 */
export function publishAckOk(
  client: MqttClient,
  deviceMac: string,
  imageName: string,
  nextWakeTime: string
): void {
  const message: AckMessage = {
    device_id: deviceMac,
    image_name: imageName,
    ACK_OK: {
      next_wake_time: nextWakeTime,
    },
  };

  const topic = `device/${deviceMac}/ack`;
  client.publish(topic, JSON.stringify(message));
  
  console.log('[ACK] Published ACK_OK:', {
    device: deviceMac,
    image: imageName,
    next_wake: nextWakeTime,
  });
}
