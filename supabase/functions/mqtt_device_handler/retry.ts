/**
 * Phase 3 - Retry Module
 * 
 * Handle image retry requests and late arrivals
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';
import type { MqttClient } from 'npm:mqtt@5.3.4';

/**
 * Publish retry command to device via MQTT
 */
export function publishRetryCommand(
  client: MqttClient,
  deviceMac: string,
  imageName: string
): void {
  const command = {
    device_id: deviceMac,
    send_image: imageName,
  };

  const topic = `device/${deviceMac}/cmd`;
  client.publish(topic, JSON.stringify(command));
  
  console.log('[Retry] Published retry command:', { device: deviceMac, image: imageName });
}

/**
 * Handle retry receipt when device resends image
 * Calls fn_retry_by_id_handler to update same rows
 */
export async function handleRetryReceipt(
  supabase: SupabaseClient,
  deviceId: string, // UUID from database
  imageName: string,
  newImageUrl: string | null
): Promise<void> {
  console.log('[Retry] Processing retry for:', imageName);

  try {
    const { data: result, error } = await supabase.rpc('fn_retry_by_id_handler', {
      p_device_id: deviceId,
      p_image_name: imageName,
      p_new_image_url: newImageUrl,
    });

    if (error) {
      console.error('[Retry] fn_retry_by_id_handler error:', error);
      return;
    }

    if (!result || !result.success) {
      console.error('[Retry] Retry handler failed:', result?.message);
      return;
    }

    console.log('[Retry] Retry success:', {
      image_id: result.image_id,
      was_failed: result.was_failed,
      is_complete: result.is_complete,
      retry_count: result.retry_count,
      original_captured_at: result.original_captured_at,
      resent_received_at: result.resent_received_at,
    });
  } catch (err) {
    console.error('[Retry] Exception handling retry:', err);
  }
}
