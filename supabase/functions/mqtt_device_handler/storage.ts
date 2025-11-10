/**
 * Phase 3 - Storage Module
 * 
 * Idempotent image upload to Supabase Storage
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';

/**
 * Upload image to Supabase Storage with idempotency
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
    const timestamp = Date.now();
    const fileName = `device_${deviceMac}_${timestamp}_${imageName}`;

    console.log('[Storage] Uploading image:', fileName, `(${imageBuffer.length} bytes)`);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: false, // Never overwrite
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
