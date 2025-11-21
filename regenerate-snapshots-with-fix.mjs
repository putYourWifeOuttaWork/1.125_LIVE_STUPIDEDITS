#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function regenerateSnapshots(siteName = 'Iot Test Site 2') {
  console.log(`🔍 Finding site: "${siteName}"...\n`);

  // Get site
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('*')
    .ilike('name', siteName)
    .single();

  if (siteError || !site) {
    console.error('❌ Site not found:', siteError);
    return;
  }

  console.log(`✅ Found site: ${site.name} (${site.site_id})\n`);

  // Get active session for this site
  const { data: session, error: sessionError } = await supabase
    .from('site_device_sessions')
    .select('*')
    .eq('site_id', site.site_id)
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (sessionError || !session) {
    console.error('❌ No active session found:', sessionError);
    return;
  }

  console.log(`✅ Found session: ${session.session_id}\n`);

  // Delete existing snapshots for this session
  console.log('🗑️  Deleting old snapshots...');
  const { error: deleteError, count } = await supabase
    .from('session_wake_snapshots')
    .delete()
    .eq('session_id', session.session_id);

  if (deleteError) {
    console.error('❌ Error deleting old snapshots:', deleteError);
    return;
  }

  console.log(`✅ Deleted ${count || 'all'} old snapshots\n`);

  // Get program details for wake schedule
  const { data: program, error: programError } = await supabase
    .from('pilot_programs')
    .select('*')
    .eq('program_id', session.program_id)
    .single();

  if (programError || !program) {
    console.error('❌ Program not found:', programError);
    return;
  }

  console.log(`📅 Program: ${program.name}`);
  console.log(`   Wake cadence: Every ${program.wake_hours_cadence || 2} hours\n`);

  // Calculate wake rounds
  const startDate = new Date(program.start_date);
  const endDate = new Date(program.end_date);
  const now = new Date();
  const currentEnd = now < endDate ? now : endDate;

  const wakeHours = program.wake_hours_cadence || 2;

  console.log(`🔨 Regenerating snapshots with FIXED function (uses latest data AS OF wake time)...\n`);

  let wakeNumber = 1;
  let snapshotsCreated = 0;
  let errors = 0;

  for (let date = new Date(startDate); date < currentEnd; date.setHours(date.getHours() + wakeHours)) {
    const wakeStart = new Date(date);
    const wakeEnd = new Date(date);
    wakeEnd.setHours(wakeEnd.getHours() + wakeHours);

    // Skip future dates
    if (wakeStart > now) break;

    // Generate snapshot with FIXED function
    const { data: snapshotId, error: genError } = await supabase
      .rpc('generate_session_wake_snapshot', {
        p_session_id: session.session_id,
        p_wake_number: wakeNumber,
        p_wake_round_start: wakeStart.toISOString(),
        p_wake_round_end: wakeEnd.toISOString()
      });

    if (genError) {
      console.error(`❌ Error generating wake #${wakeNumber}:`, genError.message);
      errors++;
    } else {
      snapshotsCreated++;
      if (snapshotsCreated <= 5 || snapshotsCreated % 20 === 0) {
        console.log(`   ✅ Wake #${wakeNumber}: ${wakeStart.toLocaleString()}`);
      }
    }

    wakeNumber++;
  }

  console.log(`\n✅ Regeneration complete!`);
  console.log(`   Created: ${snapshotsCreated}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total wakes: ${wakeNumber - 1}\n`);

  // Verify snapshots now have data
  console.log('🔍 Verifying snapshot data quality...\n');

  const { data: verifySnapshots, error: verifyError } = await supabase
    .from('session_wake_snapshots')
    .select('snapshot_id, wake_number, active_devices_count, avg_mgi, avg_temperature, avg_humidity, site_state')
    .eq('session_id', session.session_id)
    .order('wake_number', { ascending: true })
    .limit(10);

  if (verifyError) {
    console.error('❌ Error verifying:', verifyError);
    return;
  }

  console.log(`📊 Sample Snapshots (first 10):\n`);

  let withMGI = 0;
  let withTemp = 0;
  let withHumidity = 0;

  for (const snap of verifySnapshots) {
    const hasData = snap.avg_mgi !== null || snap.avg_temperature !== null || snap.avg_humidity !== null;
    const icon = hasData ? '✅' : '⚠️ ';

    console.log(`${icon} Wake #${snap.wake_number}:`);
    console.log(`   Devices: ${snap.active_devices_count}`);
    console.log(`   Avg MGI: ${snap.avg_mgi || 'null'}`);
    console.log(`   Avg Temp: ${snap.avg_temperature || 'null'}°F`);
    console.log(`   Avg Humidity: ${snap.avg_humidity || 'null'}%`);

    // Check actual device data in site_state
    const siteState = typeof snap.site_state === 'string'
      ? JSON.parse(snap.site_state)
      : snap.site_state;

    if (siteState.devices && siteState.devices.length > 0) {
      const deviceWithData = siteState.devices.find((d) =>
        d.telemetry !== null || d.mgi_state !== null
      );

      if (deviceWithData) {
        console.log(`   Device sample: telemetry=${!!deviceWithData.telemetry}, mgi_state=${!!deviceWithData.mgi_state}`);
      }
    }
    console.log('');

    if (snap.avg_mgi !== null) withMGI++;
    if (snap.avg_temperature !== null) withTemp++;
    if (snap.avg_humidity !== null) withHumidity++;
  }

  console.log(`📈 Data Coverage in First 10 Snapshots:`);
  console.log(`   With MGI: ${withMGI}/10`);
  console.log(`   With Temperature: ${withTemp}/10`);
  console.log(`   With Humidity: ${withHumidity}/10\n`);

  if (withMGI === 0 && withTemp === 0) {
    console.log('⚠️  WARNING: Snapshots still have no data!');
    console.log('   This means there is NO telemetry or MGI data in the database');
    console.log('   before the wake times. Check if devices have generated data.\n');
  } else {
    console.log('✅ Snapshots now contain data! Refresh the browser to see timeline colors.\n');
  }
}

const siteName = process.argv[2] || 'Iot Test Site 2';
regenerateSnapshots(siteName).then(() => process.exit(0));
