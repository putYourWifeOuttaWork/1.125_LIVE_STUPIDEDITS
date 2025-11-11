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
import { publishMissingChunks, publishAckOk } from './ack.ts';
import { calculateNextWake } from './scheduler.ts';

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
    const buffer = await getBuffer(supabase, deviceMac, imageName);
    if (!buffer || !buffer.imageRecord?.image_id) {
      console.error('[Finalize] No buffer or image_id found for:', imageName);
      return;
    }

    // Check for missing chunks
    const missingChunks = await getMissingChunks(supabase, deviceMac, imageName, totalChunks);
    if (missingChunks.length > 0) {
      console.log('[Finalize] Missing chunks detected:', missingChunks.length);
      await publishMissingChunks(client, deviceMac, imageName, missingChunks, supabase);
      return;
    }

    // Assemble image from Postgres chunks
    const imageBuffer = await assembleImage(supabase, deviceMac, imageName, totalChunks);
    if (!imageBuffer) {
      console.error('[Finalize] Failed to assemble image:', imageName);
      await callFailureHandler(supabase, buffer.imageRecord.image_id, 2, 'Image assembly failed');
      return;
    }

    // Upload to storage (stable filename - idempotent)
    const imageUrl = await uploadImage(supabase, deviceMac, imageName, imageBuffer, bucketName);
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

    // Calculate next wake time using device's schedule
    let nextWake: string;

    if (result.next_wake_at) {
      // Use value from SQL handler if provided
      nextWake = result.next_wake_at;
    } else {
      // Fetch device lineage to get wake schedule
      const { data: lineageData } = await supabase.rpc('fn_resolve_device_lineage', {
        p_device_mac: deviceMac,
      });

      if (lineageData?.wake_schedule_cron) {
        nextWake = calculateNextWake(lineageData.wake_schedule_cron);
        console.log('[Finalize] Calculated next wake from cron:', nextWake);
      } else {
        // Fallback: 12 hours from now
        nextWake = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
        console.warn('[Finalize] No wake schedule found, using 12h fallback');
      }
    }

    // Publish ACK_OK exactly once using advisory lock
    await withSingleAck(supabase, deviceMac, imageName, async () => {
      await publishAckOk(client, deviceMac, imageName, nextWake, supabase);
      return true;
    });

    // Clear buffer from Postgres
    await clearBuffer(supabase, deviceMac, imageName);

    console.log('[Finalize] Finalization complete for:', imageName);
  } catch (err) {
    console.error('[Finalize] Exception during finalization:', err);

    // Log to async_error_logs
    try {
      await supabase.from('async_error_logs').insert({
        table_name: 'device_images',
        trigger_name: 'edge_finalize',
        function_name: 'finalizeImage',
        payload: { device_mac: deviceMac, image_name: imageName },
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
