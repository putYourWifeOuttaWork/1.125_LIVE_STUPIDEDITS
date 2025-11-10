/**
 * Phase 3 - Storage Module (Idempotent)
 *
 * Idempotent image upload to Supabase Storage
 * STABLE FILENAMES - no timestamps (retry-safe)
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';

/**
 * Upload image to Supabase Storage with idempotency
 * Uses stable filename based on device_mac and image_name (NO timestamp)
 * Returns public URL
 */
export async function uploadImage(
  supabase: SupabaseClient,
  deviceMac: string,
  imageName: string,
  imageBuffer: Uint8Array,
  bucketName: string
): Promise<string | null> {
  try {
    // STABLE filename: deviceMac/imageName.jpg (NO timestamp)
    // This makes retries idempotent - they overwrite the same file
    const fileName = `${deviceMac}/${imageName}.jpg`;

    console.log('[Storage] Uploading image:', fileName, `(${imageBuffer.length} bytes)`);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: true, // Allow overwrite on retry
      });

    if (uploadError) {
      console.error('[Storage] Upload error:', uploadError);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    console.log('[Storage] Upload successful:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (err) {
    console.error('[Storage] Exception during upload:', err);
    return null;
  }
}
