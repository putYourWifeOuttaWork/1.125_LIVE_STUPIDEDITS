/**
 * Phase 3 - Finalize Module (SQL-Compliant)
 *
 * Assemble image, upload to storage, create observation via SQL handler, publish ACK_OK
 * CALLS fn_image_completion_handler - NO INLINE SQL
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';
import type { MqttClient } from 'npm:mqtt@5.3.4';
import { getBuffer, getMissingChunks, assembleImage, clearBuffer, withSingleAck } from './idempotency.ts';
import { uploadImage } from './storage.ts';
import { publishMissingChunks, publishSleepCommand, calculateNextWake as calculateNextWakeTime } from './ack.ts';
import { formatNextWakeTime } from './protocol.ts';
import { normalizeMacAddress } from './utils.ts';

/**
 * Finalize image transmission
 * Checks for missing chunks, assembles, uploads, creates observation via SQL handler
 */
export async function finalizeImage(
  supabase: SupabaseClient,
  client: MqttClient,
  deviceMac: string,
  imageName: string,
  totalChunks: number,
  bucketName: string
): Promise<void> {
  console.log('[Finalize] Starting finalization for:', imageName);

  try {
    // Normalize MAC address (remove separators, uppercase)
    const normalizedMac = normalizeMacAddress(deviceMac);
    if (!normalizedMac) {
      console.error('[Finalize] Invalid MAC address format:', deviceMac);
      return;
    }

    const buffer = await getBuffer(supabase, normalizedMac, imageName);
    if (!buffer || !buffer.imageRecord?.image_id) {
      console.error('[Finalize] No buffer or image_id found for:', imageName);
      return;
    }

    // Check for missing chunks
    const missingChunks = await getMissingChunks(supabase, normalizedMac, imageName, totalChunks);
    if (missingChunks.length > 0) {
      console.log('[Finalize] Missing chunks detected:', missingChunks.length);
      await publishMissingChunks(client, normalizedMac, imageName, missingChunks, supabase);
      return;
    }

    // Assemble image from Postgres chunks
    const imageBuffer = await assembleImage(supabase, normalizedMac, imageName, totalChunks);
    if (!imageBuffer) {
      console.error('[Finalize] Failed to assemble image:', imageName);
      await callFailureHandler(supabase, buffer.imageRecord.image_id, 2, 'Image assembly failed');
      return;
    }

    // Upload to storage (stable filename - idempotent)
    const imageUrl = await uploadImage(supabase, normalizedMac, imageName, imageBuffer, bucketName);
    if (!imageUrl) {
      console.error('[Finalize] Failed to upload image:', imageName);
      await callFailureHandler(supabase, buffer.imageRecord.image_id, 1, 'Image upload failed');
      return;
    }

    // Call fn_image_completion_handler (creates observation with correct submission_id)
    const { data: result, error } = await supabase.rpc('fn_image_completion_handler', {
      p_image_id: buffer.imageRecord.image_id,
      p_image_url: imageUrl,
    });

    if (error || !result || !result.success) {
      console.error('[Finalize] fn_image_completion_handler error:', error || result?.message);
      await callFailureHandler(supabase, buffer.imageRecord.image_id, 3, 'Completion handler failed');
      return;
    }

    console.log('[Finalize] Image completion success:', {
      image_id: result.image_id,
      observation_id: result.observation_id,
      slot_index: result.slot_index,
      submission_id: result.submission_id,
    });

    // PHASE 2.3: Update wake_payload to metadata_received state
    // Will be completed when SLEEP is sent
    if (buffer.imageRecord.wake_payload_id) {
      const { error: wakeError } = await supabase
        .from('device_wake_payloads')
        .update({
          image_status: 'complete',
          chunks_received: totalChunks,
          protocol_state: 'metadata_received', // Image complete, ready to send SLEEP
        })
        .eq('payload_id', buffer.imageRecord.wake_payload_id);

      if (wakeError) {
        console.error('[Finalize] Error updating wake_payload image status:', wakeError);
        // Don't fail - wake tracking is supplementary
      } else {
        console.log('[Finalize] Wake payload image marked complete:', buffer.imageRecord.wake_payload_id);
      }
    }

    // Fetch device lineage for next wake calculation
    const { data: lineageData } = await supabase.rpc('fn_resolve_device_lineage', {
      p_device_mac: normalizedMac,
    });

    if (!lineageData) {
      console.error('[Finalize] Device lineage not found for:', normalizedMac);
      return;
    }

    const deviceId = lineageData.device_id;
    const siteId = lineageData.site_id;
    const timezone = lineageData.timezone || 'America/New_York';

    // Calculate next wake time with site inheritance
    const nextWakeDate = await calculateNextWakeTime(
      supabase,
      deviceId,
      siteId,
      timezone
    );

    // Format for protocol
    const nextWakeFormatted = nextWakeDate
      ? formatNextWakeTime(nextWakeDate)
      : '8:00AM'; // Default fallback

    console.log('[Finalize] Calculated next wake:', {
      nextWake: nextWakeDate?.toISOString(),
      formatted: nextWakeFormatted,
      timezone,
    });

    // Update devices.next_wake_at for UI display and next session calculation
    if (deviceId) {
      const { error: nextWakeError } = await supabase
        .from('devices')
        .update({
          next_wake_at: nextWakeDate?.toISOString() || null,
          last_wake_at: new Date().toISOString(),
        })
        .eq('device_id', deviceId);

      if (nextWakeError) {
        console.error('[Finalize] Error updating next_wake_at:', nextWakeError);
      } else {
        console.log('[Finalize] Updated device next_wake_at:', nextWakeDate?.toISOString());
      }
    }

    // Send SLEEP command to complete the wake cycle
    // This updates protocol_state to 'complete' and marks wake as finished
    await publishSleepCommand(
      client,
      normalizedMac,
      nextWakeFormatted,
      supabase,
      buffer.imageRecord.wake_payload_id
    );

    // Clear buffer from Postgres
    await clearBuffer(supabase, normalizedMac, imageName);

    console.log('[Finalize] Finalization complete for:', imageName);
  } catch (err) {
    console.error('[Finalize] Exception during finalization:', err);

    // Log to async_error_logs
    try {
      const normalizedMac = normalizeMacAddress(deviceMac);
      await supabase.from('async_error_logs').insert({
        table_name: 'device_images',
        trigger_name: 'edge_finalize',
        function_name: 'finalizeImage',
        payload: { device_mac: normalizedMac || deviceMac, image_name: imageName },
        error_message: err instanceof Error ? err.message : String(err),
        error_details: { stack: err instanceof Error ? err.stack : null },
      });
    } catch (logErr) {
      console.error('[Finalize] Failed to log error:', logErr);
    }
  }
}

/**
 * Call fn_image_failure_handler (SQL handler)
 */
async function callFailureHandler(
  supabase: SupabaseClient,
  imageId: string,
  errorCode: number,
  errorMessage: string
): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('fn_image_failure_handler', {
      p_image_id: imageId,
      p_error_code: errorCode,
      p_error_message: errorMessage,
    });

    if (error) {
      console.error('[Finalize] fn_image_failure_handler error:', error);
    } else {
      console.log('[Finalize] Marked image as failed:', imageId, 'alert_created:', data?.alert_created);
    }
  } catch (err) {
    console.error('[Finalize] Exception calling failure handler:', err);
  }
}
