#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const SESSION_ID = '4889eee2-6836-4f52-bbe4-9391e0930f88'; // Jan 4, 2026 IoT Test Site

async function regenerateSnapshotsForSession() {
  console.log('📸 REGENERATING SNAPSHOTS FOR JANUARY 4 SESSION\n');
  console.log('=' .repeat(80));

  // Get session details
  const { data: session, error: sessionError } = await supabase
    .from('site_device_sessions')
    .select('*, sites!inner(name, length, width)')
    .eq('session_id', SESSION_ID)
    .single();

  if (sessionError || !session) {
    console.error('❌ Error fetching session:', sessionError);
    return;
  }

  console.log(`\nSession: ${session.sites.name}`);
  console.log(`Date: ${session.session_date}`);
  console.log(`Status: ${session.status}`);
  console.log(`Time: ${session.session_start_time} → ${session.session_end_time}\n`);

  // Delete existing snapshots
  console.log('🗑️  Deleting old snapshots...');
  const { error: deleteError } = await supabase
    .from('session_wake_snapshots')
    .delete()
    .eq('session_id', SESSION_ID);

  if (deleteError) {
    console.error('❌ Error deleting old snapshots:', deleteError);
    return;
  }
  console.log('✅ Old snapshots deleted\n');

  // Get all wake payloads for this session
  console.log('📊 Fetching wake payloads...');
  const { data: payloads, error: payloadsError } = await supabase
    .from('device_wake_payloads')
    .select(`
      payload_id,
      device_id,
      captured_at,
      temperature,
      humidity,
      pressure,
      image_id,
      wake_window_index,
      wake_type
    `)
    .eq('site_device_session_id', SESSION_ID)
    .order('captured_at');

  if (payloadsError || !payloads || payloads.length === 0) {
    console.error('❌ No wake payloads found for this session');
    return;
  }

  console.log(`✅ Found ${payloads.length} wake payloads\n`);

  // Display payload summary
  console.log('Wake Payloads Summary:');
  payloads.forEach((p, idx) => {
    const time = new Date(p.captured_at).toISOString().substring(11, 19);
    const hasTemp = p.temperature !== null;
    const hasImage = p.image_id !== null;
    console.log(`  ${idx + 1}. ${time} | Temp: ${hasTemp ? '✅' : '❌'} | Image: ${hasImage ? '✅' : '❌'} | Type: ${p.wake_type || 'N/A'}`);
  });
  console.log();

  // Group payloads into hourly wake windows
  console.log('🕐 Grouping payloads into wake windows...\n');
  const wakeWindows = new Map();

  payloads.forEach(payload => {
    const timestamp = new Date(payload.captured_at);
    // Round to nearest hour for grouping
    const hour = new Date(timestamp);
    hour.setMinutes(0, 0, 0);
    const hourKey = hour.toISOString();

    if (!wakeWindows.has(hourKey)) {
      wakeWindows.set(hourKey, []);
    }
    wakeWindows.get(hourKey).push(payload);
  });

  console.log(`Created ${wakeWindows.size} wake windows\n`);

  // Generate snapshots for each wake window
  let successCount = 0;
  let failCount = 0;
  let wakeNumber = 1;

  const sortedWindows = Array.from(wakeWindows.entries()).sort((a, b) =>
    new Date(a[0]).getTime() - new Date(b[0]).getTime()
  );

  for (const [hourKey, windowPayloads] of sortedWindows) {
    const wakeStart = new Date(hourKey);
    const wakeEnd = new Date(wakeStart);
    wakeEnd.setHours(wakeEnd.getHours() + 1);

    const payloadsWithTemp = windowPayloads.filter(p => p.temperature !== null).length;
    const payloadsWithImages = windowPayloads.filter(p => p.image_id !== null).length;

    console.log(`Wake #${wakeNumber}: ${wakeStart.toISOString().substring(11, 16)}`);
    console.log(`  Window: ${wakeStart.toISOString()} → ${wakeEnd.toISOString()}`);
    console.log(`  Payloads: ${windowPayloads.length} (${payloadsWithTemp} with temp, ${payloadsWithImages} with images)`);

    try {
      const { data: snapshotId, error: snapshotError } = await supabase
        .rpc('generate_session_wake_snapshot', {
          p_session_id: SESSION_ID,
          p_wake_number: wakeNumber,
          p_wake_round_start: wakeStart.toISOString(),
          p_wake_round_end: wakeEnd.toISOString()
        });

      if (snapshotError) {
        console.log(`  ❌ Error: ${snapshotError.message}`);
        failCount++;
      } else {
        console.log(`  ✅ Created snapshot: ${snapshotId}`);
        successCount++;
      }
    } catch (error) {
      console.log(`  ❌ Exception: ${error.message}`);
      failCount++;
    }

    wakeNumber++;
    console.log();
  }

  console.log('=' .repeat(80));
  console.log(`\n📊 SUMMARY: Created ${successCount}/${wakeWindows.size} snapshots (${failCount} failed)\n`);

  // Verify snapshots
  console.log('🔍 Verifying snapshots...\n');
  const { data: verifySnapshots, error: verifyError } = await supabase
    .from('session_wake_snapshots')
    .select('wake_number, avg_temperature, avg_humidity, new_images_this_round, site_state')
    .eq('session_id', SESSION_ID)
    .order('wake_number');

  if (verifyError) {
    console.error('❌ Error verifying snapshots:', verifyError);
    return;
  }

  if (verifySnapshots && verifySnapshots.length > 0) {
    console.log(`Found ${verifySnapshots.length} snapshots:\n`);

    verifySnapshots.forEach(s => {
      const siteState = typeof s.site_state === 'string' ? JSON.parse(s.site_state) : s.site_state;
      const deviceCount = siteState?.devices?.length || 0;

      console.log(`  Wake #${s.wake_number}:`);
      console.log(`    Temperature: ${s.avg_temperature ? s.avg_temperature.toFixed(1) + '°F' : 'null'}`);
      console.log(`    Humidity: ${s.avg_humidity ? s.avg_humidity.toFixed(1) + '%' : 'null'}`);
      console.log(`    Images: ${s.new_images_this_round || 0}`);
      console.log(`    Devices in state: ${deviceCount}`);
    });

    const withData = verifySnapshots.filter(s =>
      s.avg_temperature !== null || s.avg_humidity !== null || (s.new_images_this_round || 0) > 0
    ).length;

    console.log(`\n  Snapshots with data: ${withData}/${verifySnapshots.length}`);

    if (withData > 0) {
      console.log('\n✅ SUCCESS! Snapshots have data - map and analytics should render now!');
      console.log('\n📍 Next steps:');
      console.log('  1. Open the app and navigate to this session');
      console.log('  2. The map and analytics tabs should now display data');
      console.log(`  3. Session URL: /programs/{programId}/sites/{siteId}/sessions/${SESSION_ID}`);
    } else {
      console.log('\n⚠️  WARNING: Snapshots created but have NO data');
      console.log('   Possible causes:');
      console.log('   - Wake payloads missing telemetry data');
      console.log('   - Device positions not set');
      console.log('   - Snapshot function needs to be updated via APPLY_SIMPLE_SNAPSHOT_FIX.sql');
    }
  } else {
    console.log('❌ No snapshots found after generation!');
  }
}

// Run regeneration
regenerateSnapshotsForSession()
  .then(() => {
    console.log('\n✅ Snapshot regeneration complete!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Snapshot regeneration failed:', error);
    process.exit(1);
  });
