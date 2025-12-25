/**
 * Phase 3 - Retry Module (SQL-Compliant)
 *
 * Handle image retry requests and late arrivals
 * CALLS fn_retry_by_id_handler - NO INLINE SQL
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

  const topic = `ESP32CAM/${deviceMac}/cmd`;
  client.publish(topic, JSON.stringify(command));

  console.log('[Retry] Published retry command:', { device: deviceMac, image: imageName });
}

/**
 * Handle retry receipt when device resends image
 * Calls fn_retry_by_id_handler to update same rows (preserves captured_at, sets resent_received_at)
 */
export async function handleRetryReceipt(
  supabase: SupabaseClient,
  deviceMac: string, // MAC address from MQTT
  imageName: string,
  newImageUrl: string
): Promise<void> {
  console.log('[Retry] Processing retry for:', imageName);

  try {
    // First resolve device_mac to device_id (UUID)
    const { data: deviceData, error: deviceError } = await supabase
      .from('devices')
      .select('device_id')
      .eq('device_mac', deviceMac)
      .maybeSingle();

    if (deviceError || !deviceData) {
      console.error('[Retry] Device not found:', deviceMac);
      return;
    }

    const deviceId = deviceData.device_id;

    // Call SQL handler: fn_retry_by_id_handler
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
      session_id: result.session_id,
    });
  } catch (err) {
    console.error('[Retry] Exception handling retry:', err);

    // Log to async_error_logs
    try {
      await supabase.from('async_error_logs').insert({
        table_name: 'device_images',
        trigger_name: 'edge_retry',
        function_name: 'handleRetryReceipt',
        payload: { device_mac: deviceMac, image_name: imageName },
        error_message: err instanceof Error ? err.message : String(err),
        error_details: { stack: err instanceof Error ? err.stack : null },
      });
    } catch (logErr) {
      console.error('[Retry] Failed to log error:', logErr);
    }
  }
}
