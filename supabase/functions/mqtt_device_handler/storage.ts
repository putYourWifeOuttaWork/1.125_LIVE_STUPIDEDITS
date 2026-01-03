/**
 * Phase 3 - Storage Module (Idempotent)
 *
 * Idempotent image upload to Supabase Storage
 * STABLE FILENAMES - no timestamps (retry-safe)
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';
import { normalizeMacAddress } from './utils.ts';

/**
 * Upload image to Supabase Storage with idempotency
 * Uses hierarchical path: company_id/site_id/device_mac/image_name
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
    // Normalize MAC address (remove separators, uppercase)
    const normalizedMac = normalizeMacAddress(deviceMac);
    if (!normalizedMac) {
      console.error('[Storage] Invalid MAC address format:', deviceMac);
      return null;
    }

    // First, resolve device lineage to get company_id and site_id
    const { data: lineageData, error: lineageError } = await supabase.rpc(
      'fn_resolve_device_lineage',
      { p_device_mac: normalizedMac }
    );

    if (lineageError || !lineageData) {
      console.error('[Storage] Failed to resolve device lineage:', lineageError);
      // Fallback to simple path if lineage resolution fails
      const fileName = `${normalizedMac}/${imageName}`;
      return await uploadWithPath(supabase, bucketName, fileName, imageBuffer);
    }

    // Build hierarchical path using SQL function
    const { data: pathData, error: pathError } = await supabase.rpc(
      'fn_build_device_image_path',
      {
        p_company_id: lineageData.company_id,
        p_site_id: lineageData.site_id,
        p_device_mac: normalizedMac,
        p_image_name: imageName,
      }
    );

    if (pathError || !pathData) {
      console.error('[Storage] Failed to build image path:', pathError);
      // Fallback to simple path
      const fileName = `${normalizedMac}/${imageName}`;
      return await uploadWithPath(supabase, bucketName, fileName, imageBuffer);
    }

    return await uploadWithPath(supabase, bucketName, pathData, imageBuffer);
  } catch (err) {
    console.error('[Storage] Exception during upload:', err);
    return null;
  }
}

/**
 * Internal helper: Upload image to storage with given path
 */
async function uploadWithPath(
  supabase: SupabaseClient,
  bucketName: string,
  filePath: string,
  imageBuffer: Uint8Array
): Promise<string | null> {
  console.log('[Storage] Uploading image:', filePath, `(${imageBuffer.length} bytes)`);

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(filePath, imageBuffer, {
      contentType: 'image/jpeg',
      upsert: true, // Allow overwrite on retry
      cacheControl: '3600', // Cache for 1 hour
    });

  if (uploadError) {
    console.error('[Storage] Upload error:', uploadError);
    return null;
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(filePath);

  console.log('[Storage] Upload successful:', urlData.publicUrl);
  return urlData.publicUrl;
}
