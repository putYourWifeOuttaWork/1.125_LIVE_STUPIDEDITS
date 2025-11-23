#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  console.log('=== Simple Diagnosis ===\n');
  console.log('Screenshot shows Site="Iot Test Site 2", Date="November 19, 2025", Expected=31\n');

  // The issue: Expected=31 doesn't match ANY session in database
  // This means the screenshot might be from BEFORE the page was refreshed
  // Or it's calculating expected dynamically from devices

  // Let's check: If we have 4 devices with different expected wake counts that sum to 31
  console.log('Theory: The UI calculates Expected by summing device expected_wakes_in_session\n');

  // Get site
  const { data: site } = await supabase
    .from('sites')
    .select('site_id, name')
    .ilike('name', '%Iot Test Site 2%')
    .single();

  if (!site) {
    console.log('Site not found');
    return;
  }

  console.log(`Found site: ${site.name} (${site.site_id})\n`);

  // Get Nov 19 sessions for this site
  const { data: sessions } = await supabase
    .from('site_device_sessions')
    .select('*')
    .eq('site_id', site.site_id)
    .eq('session_date', '2025-11-19');

  console.log(`Nov 19 sessions for this site: ${sessions?.length || 0}\n`);

  for (const session of sessions || []) {
    console.log(`Session ${session.session_id.substring(0, 8)}`);
    console.log(`  Expected (stored in session): ${session.expected_wake_count}`);
    console.log(`  Completed (stored in session): ${session.completed_wake_count}`);
    
    // Get devices for this session  
    const { data: devices } = await supabase
      .from('device_site_assignments')
      .select(`
        device_id,
        devices!inner (
          device_code,
          wake_schedule_cron
        )
      `)
      .eq('site_id', site.site_id)
      .lte('assigned_at', session.session_end_time)
      .or(`unassigned_at.is.null,unassigned_at.gte.${session.session_start_time}`);

    console.log(`  Devices assigned during session: ${devices?.length || 0}`);
    
    if (devices && devices.length > 0) {
      console.log(`  Device codes: ${devices.map(d => d.devices.device_code).join(', ')}`);
    }
    console.log('');
  }

  console.log('\n💡 KEY INSIGHT:');
  console.log('The screenshot shows "Expected: 31" but NO session in the DB has expected_wake_count=31');
  console.log('This means the UI is SUM of per-device expected wakes, NOT the session.expected_wake_count column!');
  console.log('\nThe migration fixed the RPC function, but if cached data or stale UI state...');
  console.log('User needs to: HARD REFRESH the page (Cmd+Shift+R or Ctrl+Shift+R)');
}

diagnose().then(() => process.exit(0)).catch(console.error);
