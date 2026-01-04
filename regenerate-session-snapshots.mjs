#!/usr/bin/env node

/**
 * Regenerate Session Snapshots
 *
 * Creates wake-level snapshots based on actual payload timestamps,
 * not relying on wake_window_index which may be NULL.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function regenerateSnapshotsForSession(sessionId) {
  console.log(`\n📸 Regenerating snapshots for session: ${sessionId}\n`);

  // Get session details
  const { data: session, error: sessionError } = await supabase
    .from('site_device_sessions')
    .select('*, sites(name, site_code)')
    .eq('session_id', sessionId)
    .single();

  if (sessionError || !session) {
    console.error('❌ Error fetching session:', sessionError);
    return;
  }

  console.log(`Session: ${session.sites.name} (${session.sites.site_code})`);
  console.log(`Date: ${session.session_date}`);
  console.log(`Time: ${session.session_start_time} → ${session.session_end_time}\n`);

  // Delete existing snapshots
  const { error: deleteError } = await supabase
    .from('session_wake_snapshots')
    .delete()
    .eq('session_id', sessionId);

  if (deleteError) {
    console.error('❌ Error deleting old snapshots:', deleteError);
  } else {
    console.log('✅ Deleted old snapshots');
  }

  // Get all wake payloads, grouped by hour
  const { data: payloads, error: payloadsError } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, device_id, captured_at, temperature, humidity, image_id')
    .eq('site_device_session_id', sessionId)
    .order('captured_at');

  if (payloadsError || !payloads || payloads.length === 0) {
    console.error('❌ No payloads found:', payloadsError);
    return;
  }

  console.log(`Found ${payloads.length} wake payloads\n`);

  // Group payloads by hour (or whatever granularity makes sense)
  const hourlyGroups = new Map();

  payloads.forEach(payload => {
    const timestamp = new Date(payload.captured_at);
    // Round to nearest hour for grouping
    const hourKey = new Date(timestamp);
    hourKey.setMinutes(0, 0, 0);
    const hourStr = hourKey.toISOString();

    if (!hourlyGroups.has(hourStr)) {
      hourlyGroups.set(hourStr, []);
    }
    hourlyGroups.get(hourStr).push(payload);
  });

  console.log(`Grouped into ${hourlyGroups.size} hourly time buckets\n`);

  // Generate a snapshot for each hour
  let wakeNumber = 1;
  const sortedHours = Array.from(hourlyGroups.keys()).sort();

  for (const hourKey of sortedHours) {
    const payloadsInHour = hourlyGroups.get(hourKey);
    const hourStart = new Date(hourKey);
    const hourEnd = new Date(hourStart);
    hourEnd.setHours(hourEnd.getHours() + 1);

    console.log(`Wake #${wakeNumber}: ${hourStart.toISOString().split('T')[1].substring(0, 5)}`);
    console.log(`  Payloads: ${payloadsInHour.length}`);
    console.log(`  With telemetry: ${payloadsInHour.filter(p => p.temperature !== null).length}`);
    console.log(`  With images: ${payloadsInHour.filter(p => p.image_id !== null).length}`);

    // Call snapshot generation function
    const { data, error } = await supabase
      .rpc('generate_session_wake_snapshot', {
        p_session_id: sessionId,
        p_wake_number: wakeNumber,
        p_wake_round_start: hourStart.toISOString(),
        p_wake_round_end: hourEnd.toISOString()
      });

    if (error) {
      console.error(`  ❌ Error:`, error.message);
    } else {
      console.log(`  ✅ Snapshot created`);
    }

    wakeNumber++;
    console.log('');
  }

  console.log(`\n✅ Generated ${wakeNumber - 1} snapshots\n`);

  // Verify snapshots were created
  const { data: verifySnapshots, error: verifyError } = await supabase
    .from('session_wake_snapshots')
    .select('wake_number, avg_temperature, avg_humidity, avg_mgi, new_images_this_round')
    .eq('session_id', sessionId)
    .order('wake_number');

  if (verifyError) {
    console.error('❌ Error verifying snapshots:', verifyError);
  } else if (verifySnapshots && verifySnapshots.length > 0) {
    console.log('📊 SNAPSHOT VERIFICATION');
    console.log('-'.repeat(80));
    verifySnapshots.forEach(snap => {
      console.log(`Wake #${snap.wake_number}:`);
      console.log(`  Avg temp: ${snap.avg_temperature || 'null'}`);
      console.log(`  Avg humidity: ${snap.avg_humidity || 'null'}`);
      console.log(`  Avg MGI: ${snap.avg_mgi || 'null'}`);
      console.log(`  New images: ${snap.new_images_this_round || 0}`);
    });

    const uniqueTemps = new Set(verifySnapshots.map(s => s.avg_temperature).filter(t => t !== null));
    if (uniqueTemps.size > 1) {
      console.log(`\n✅ Temperature varies across ${uniqueTemps.size} values (animations will work!)`);
    } else if (uniqueTemps.size === 1) {
      console.log(`\n⚠️  All snapshots have same temperature (static visualization)`);
    } else {
      console.log(`\n⚠️  All temperatures are NULL (no telemetry data)`);
    }
  } else {
    console.log('⚠️  No snapshots were created!');
  }
}

async function main() {
  // Get recent session with completed wakes
  const { data: sessions } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, completed_wake_count')
    .order('session_date', { ascending: false })
    .limit(5);

  if (!sessions || sessions.length === 0) {
    console.error('No sessions found');
    return;
  }

  const bestSession = sessions.reduce((prev, curr) =>
    (curr.completed_wake_count || 0) > (prev.completed_wake_count || 0) ? curr : prev
  );

  console.log('=' .repeat(80));
  console.log('SESSION SNAPSHOT REGENERATION');
  console.log('=' .repeat(80));
  console.log(`\nTarget: ${bestSession.session_id}`);
  console.log(`Date: ${bestSession.session_date}`);
  console.log(`Completed wakes: ${bestSession.completed_wake_count}\n`);

  await regenerateSnapshotsForSession(bestSession.session_id);

  console.log('\n=' .repeat(80));
  console.log('✅ SNAPSHOT REGENERATION COMPLETE!');
  console.log('=' .repeat(80));
  console.log('\nRefresh the UI to see:');
  console.log('- Analytics tab with temperature/humidity charts');
  console.log('- Images tab with linked images');
  console.log('- Map with animated device states\n');
}

main().catch(console.error);
