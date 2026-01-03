/**
 * Phase 3 - Resolver Module (Simplified)
 *
 * Minimal device MAC → UUID lookup
 * SQL handlers do the heavy lifting for lineage resolution
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';
import { normalizeMacAddress } from './utils.ts';

/**
 * Simple device_mac to device_id lookup
 * fn_wake_ingestion_handler handles full lineage resolution
 */
export async function resolveDeviceId(
  supabase: SupabaseClient,
  deviceMac: string
): Promise<string | null> {
  try {
    // Normalize MAC address (remove separators, uppercase)
    const normalizedMac = normalizeMacAddress(deviceMac);
    if (!normalizedMac) {
      console.error('[Resolver] Invalid MAC address format:', deviceMac);
      return null;
    }

    const { data, error } = await supabase
      .from('devices')
      .select('device_id')
      .eq('device_mac', normalizedMac)
      .maybeSingle();

    if (error || !data) {
      console.error('[Resolver] Device not found:', deviceMac);
      return null;
    }

    return data.device_id;
  } catch (err) {
    console.error('[Resolver] Exception resolving device:', err);
    return null;
  }
}
