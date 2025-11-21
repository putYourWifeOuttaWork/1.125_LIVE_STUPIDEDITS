#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function generateSnapshotsForSite(siteName = 'Iot Test Site 2') {
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

  console.log(`✅ Found session: ${session.session_id}`);
  console.log(`   Program: ${session.program_id}`);
  console.log(`   Status: ${session.status}\n`);

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
  console.log(`   Start: ${program.start_date}`);
  console.log(`   End: ${program.end_date}`);
  console.log(`   Wake cadence: Every ${program.wake_hours_cadence} hours\n`);

  // Calculate wake rounds
  const startDate = new Date(program.start_date);
  const endDate = new Date(program.end_date);
  const now = new Date();
  const currentEnd = now < endDate ? now : endDate;

  const wakeHours = program.wake_hours_cadence || 2;
  const wakesPerDay = Math.floor(24 / wakeHours);

  console.log(`🔨 Generating snapshots (${wakesPerDay} per day)...\n`);

  let wakeNumber = 1;
  let snapshotsCreated = 0;
  let snapshotsSkipped = 0;

  for (let date = new Date(startDate); date < currentEnd; date.setHours(date.getHours() + wakeHours)) {
    const wakeStart = new Date(date);
    const wakeEnd = new Date(date);
    wakeEnd.setHours(wakeEnd.getHours() + wakeHours);

    // Skip future dates
    if (wakeStart > now) break;

    // Check if snapshot already exists
    const { data: existing } = await supabase
      .from('session_wake_snapshots')
      .select('snapshot_id')
      .eq('session_id', session.session_id)
      .eq('wake_number', wakeNumber)
      .single();

    if (existing) {
      snapshotsSkipped++;
      wakeNumber++;
      continue;
    }

    // Generate snapshot
    const { data: snapshotId, error: genError } = await supabase
      .rpc('generate_session_wake_snapshot', {
        p_session_id: session.session_id,
        p_wake_number: wakeNumber,
        p_wake_round_start: wakeStart.toISOString(),
        p_wake_round_end: wakeEnd.toISOString()
      });

    if (genError) {
      console.error(`❌ Error generating wake #${wakeNumber}:`, genError.message);
    } else {
      snapshotsCreated++;
      if (snapshotsCreated <= 3 || snapshotsCreated % 10 === 0) {
        console.log(`   ✅ Wake #${wakeNumber}: ${wakeStart.toLocaleString()}`);
      }
    }

    wakeNumber++;
  }

  console.log(`\n✅ Snapshot generation complete!`);
  console.log(`   Created: ${snapshotsCreated}`);
  console.log(`   Skipped (already existed): ${snapshotsSkipped}`);
  console.log(`   Total wakes: ${wakeNumber - 1}\n`);

  // Verify snapshots
  const { data: snapshots, error: snapError } = await supabase
    .from('session_wake_snapshots')
    .select('snapshot_id, wake_number, active_devices_count, avg_mgi, avg_temperature, avg_humidity')
    .eq('session_id', session.session_id)
    .order('wake_number', { ascending: true });

  if (snapError) {
    console.error('❌ Error verifying snapshots:', snapError);
    return;
  }

  console.log(`📊 Snapshot Summary:`);
  console.log(`   Total snapshots: ${snapshots.length}`);
  if (snapshots.length > 0) {
    const sample = snapshots[0];
    console.log(`   Sample (Wake #${sample.wake_number}):`);
    console.log(`     Active devices: ${sample.active_devices_count}`);
    console.log(`     Avg MGI: ${sample.avg_mgi}`);
    console.log(`     Avg Temp: ${sample.avg_temperature}°F`);
    console.log(`     Avg Humidity: ${sample.avg_humidity}%`);
  }
}

const siteName = process.argv[2] || 'Iot Test Site 2';
generateSnapshotsForSite(siteName).then(() => process.exit(0));
