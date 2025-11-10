/**
 * Phase 3 - Finalize Module
 * 
 * Assemble image, upload to storage, create observation, publish ACK_OK
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';
import type { MqttClient } from 'npm:mqtt@5.3.4';
import type { DeviceLineage } from './types.ts';
import { getBuffer, isComplete, getMissingChunks, assembleImage, clearBuffer } from './idempotency.ts';
import { uploadImage } from './storage.ts';
import { publishMissingChunks, publishAckOk } from './ack.ts';
import { calculateNextWake } from './schedule.ts';

/**
 * Finalize image transmission
 * Checks for missing chunks, assembles, uploads, creates observation
 */
export async function finalizeImage(
  supabase: SupabaseClient,
  client: MqttClient,
  deviceMac: string,
  imageName: string,
  lineage: DeviceLineage,
  bucketName: string
): Promise<void> {
  console.log('[Finalize] Starting finalization for:', imageName);

  try {
    const buffer = getBuffer(deviceMac, imageName);
    if (!buffer) {
      console.error('[Finalize] No buffer found for:', imageName);
      return;
    }

    // Check for missing chunks
    const missingChunks = getMissingChunks(deviceMac, imageName);
    if (missingChunks.length > 0) {
      console.log('[Finalize] Missing chunks detected:', missingChunks.length);
      publishMissingChunks(client, deviceMac, imageName, missingChunks);
      return;
    }

    // Assemble image
    const imageBuffer = assembleImage(deviceMac, imageName);
    if (!imageBuffer) {
      console.error('[Finalize] Failed to assemble image:', imageName);
      // Call fn_image_failure_handler
      await callFailureHandler(supabase, buffer.imageRecord?.image_id, 2, 'Image assembly failed');
      return;
    }

    // Upload to storage
    const imageUrl = await uploadImage(supabase, deviceMac, imageName, imageBuffer, bucketName);
    if (!imageUrl) {
      console.error('[Finalize] Failed to upload image:', imageName);
      await callFailureHandler(supabase, buffer.imageRecord?.image_id, 1, 'Image upload failed');
      return;
    }

    // Call fn_image_completion_handler
    const { data: result, error } = await supabase.rpc('fn_image_completion_handler', {
      p_image_id: buffer.imageRecord.image_id,
      p_image_url: imageUrl,
    });

    if (error || !result || !result.success) {
      console.error('[Finalize] fn_image_completion_handler error:', error || result?.message);
      await callFailureHandler(supabase, buffer.imageRecord?.image_id, 3, 'Completion handler failed');
      return;
    }

    console.log('[Finalize] Image completion success:', {
      image_id: result.image_id,
      observation_id: result.observation_id,
      slot_index: result.slot_index,
    });

    // Calculate next wake time
    const nextWake = calculateNextWake(lineage.wake_schedule_cron, lineage.timezone);

    // Publish ACK_OK
    publishAckOk(client, deviceMac, imageName, nextWake);

    // Clear buffer
    clearBuffer(deviceMac, imageName);

    console.log('[Finalize] Finalization complete for:', imageName);
  } catch (err) {
    console.error('[Finalize] Exception during finalization:', err);
  }
}

/**
 * Call fn_image_failure_handler
 */
async function callFailureHandler(
  supabase: SupabaseClient,
  imageId: string | undefined,
  errorCode: number,
  errorMessage: string
): Promise<void> {
  if (!imageId) return;

  try {
    const { data, error } = await supabase.rpc('fn_image_failure_handler', {
      p_image_id: imageId,
      p_error_code: errorCode,
      p_error_message: errorMessage,
    });

    if (error) {
      console.error('[Finalize] fn_image_failure_handler error:', error);
    } else {
      console.log('[Finalize] Marked image as failed:', imageId);
    }
  } catch (err) {
    console.error('[Finalize] Exception calling failure handler:', err);
  }
}
