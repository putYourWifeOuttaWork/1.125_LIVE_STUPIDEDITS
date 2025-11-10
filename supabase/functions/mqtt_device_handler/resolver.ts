/**
 * Phase 3 - Resolver Module
 * 
 * Handles device lineage resolution and session lookup
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.39.8';
import type { DeviceLineage, SiteSessionInfo } from './types.ts';

/**
 * Resolve device lineage from MAC address
 * Returns full ancestry: company → program → site → device
 */
export async function resolveDeviceLineage(
  supabase: SupabaseClient,
  deviceMac: string
): Promise<DeviceLineage | null> {
  try {
    // Query device with active site assignment
    const { data, error } = await supabase
      .from('devices')
      .select(`
        device_id,
        device_mac,
        company_id,
        wake_schedule_cron,
        is_active,
        provisioning_status,
        device_site_assignments!inner(
          site_id,
          is_active,
          is_primary,
          sites!inner(
            program_id,
            timezone,
            pilot_programs!inner(
              company_id
            )
          )
        )
      `)
      .eq('device_mac', deviceMac)
      .eq('device_site_assignments.is_active', true)
      .eq('device_site_assignments.is_primary', true)
      .maybeSingle();

    if (error) {
      console.error('[Resolver] Database error:', error);
      return null;
    }

    if (!data || !data.device_site_assignments || data.device_site_assignments.length === 0) {
      console.warn('[Resolver] Device not found or not assigned:', deviceMac);
      return null;
    }

    const assignment = data.device_site_assignments[0];
    const site = assignment.sites;
    const program = site.pilot_programs;

    const lineage: DeviceLineage = {
      device_id: data.device_id,
      device_mac: data.device_mac,
      company_id: program.company_id,
      program_id: site.program_id,
      site_id: assignment.site_id,
      timezone: site.timezone || 'UTC',
      wake_schedule_cron: data.wake_schedule_cron,
      is_active: data.is_active,
      provisioning_status: data.provisioning_status,
    };

    console.log('[Resolver] Resolved lineage:', {
      device_mac: deviceMac,
      device_id: lineage.device_id,
      site_id: lineage.site_id,
      company_id: lineage.company_id,
    });

    return lineage;
  } catch (err) {
    console.error('[Resolver] Exception resolving lineage:', err);
    return null;
  }
}

/**
 * Get or create site device session for given date
 * Calls fn_midnight_session_opener if session doesn't exist
 */
export async function getOrCreateSiteSession(
  supabase: SupabaseClient,
  siteId: string,
  sessionDate: string, // YYYY-MM-DD in site timezone
  timezone: string
): Promise<SiteSessionInfo | null> {
  try {
    // Try to get existing session
    const { data: existingSession, error: queryError } = await supabase
      .from('site_device_sessions')
      .select('session_id, site_id, session_date, device_submission_id, expected_wake_count, status')
      .eq('site_id', siteId)
      .eq('session_date', sessionDate)
      .maybeSingle();

    if (queryError) {
      console.error('[Resolver] Error querying session:', queryError);
      return null;
    }

    if (existingSession) {
      console.log('[Resolver] Found existing session:', existingSession.session_id);
      return existingSession as SiteSessionInfo;
    }

    // Session doesn't exist - create it via SQL function
    console.log('[Resolver] Creating new session via fn_midnight_session_opener');
    
    const { data: createResult, error: createError } = await supabase
      .rpc('fn_midnight_session_opener', {
        p_site_id: siteId,
      });

    if (createError) {
      console.error('[Resolver] Error creating session:', createError);
      return null;
    }

    if (!createResult || !createResult.success) {
      console.error('[Resolver] Session creation failed:', createResult?.message);
      return null;
    }

    // Fetch the newly created session
    const { data: newSession, error: fetchError } = await supabase
      .from('site_device_sessions')
      .select('session_id, site_id, session_date, device_submission_id, expected_wake_count, status')
      .eq('site_id', siteId)
      .eq('session_date', sessionDate)
      .single();

    if (fetchError || !newSession) {
      console.error('[Resolver] Error fetching new session:', fetchError);
      return null;
    }

    console.log('[Resolver] Created new session:', newSession.session_id);
    return newSession as SiteSessionInfo;
  } catch (err) {
    console.error('[Resolver] Exception in getOrCreateSiteSession:', err);
    return null;
  }
}
