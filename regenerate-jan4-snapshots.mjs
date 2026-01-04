#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const SESSION_ID = '4889eee2-6836-4f52-bbe4-9391e0930f88';

async function regenerateSnapshots() {
  console.log('📸 Regenerating snapshots for Jan 4 session...\n');

  // Get session details
  const { data: session, error: sessionError } = await supabase
    .from('site_device_sessions')
    .select('*, sites(name)')
    .eq('session_id', SESSION_ID)
    .single();

  if (sessionError || !session) {
    console.error('❌ Error fetching session:', sessionError);
    return;
  }

  console.log(`Session: ${session.sites.name}`);
  console.log(`Date: ${session.session_date}`);
  console.log(`Time: ${session.session_start_time} → ${session.session_end_time}\n`);

  // Delete existing snapshots
  const { error: deleteError } = await supabase
    .from('session_wake_snapshots')
    .delete()
    .eq('session_id', SESSION_ID);

  if (deleteError) {
    console.error('❌ Error deleting old snapshots:', deleteError);
  } else {
    console.log('✅ Deleted old snapshots\n');
  }

  // Get all wake payloads for this session
  const { data: payloads, error: payloadsError } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, device_id, captured_at, temperature, humidity, image_id')
    .eq('site_device_session_id', SESSION_ID)
    .order('captured_at');

  if (payloadsError || !payloads || payloads.length === 0) {
    console.error('❌ No payloads found');
    return;
  }

  console.log(`Found ${payloads.length} wake payloads\n`);

  // Group payloads by hour
  const hourlyGroups = new Map();

  payloads.forEach(payload => {
    const timestamp = new Date(payload.captured_at);
    const hourKey = new Date(timestamp);
    hourKey.setMinutes(0, 0, 0);
    const hourStr = hourKey.toISOString();

    if (!hourlyGroups.has(hourStr)) {
      hourlyGroups.set(hourStr, []);
    }
    hourlyGroups.get(hourStr).push(payload);
  });

  console.log(`Grouped into ${hourlyGroups.size} hourly buckets\n`);

  let wakeNumber = 1;
  const sortedHours = Array.from(hourlyGroups.keys()).sort();
  let successCount = 0;

  for (const hourKey of sortedHours) {
    const payloadsInHour = hourlyGroups.get(hourKey);
    const hourStart = new Date(hourKey);
    const hourEnd = new Date(hourStart);
    hourEnd.setHours(hourEnd.getHours() + 1);

    console.log(`Wake #${wakeNumber}: ${hourStart.toISOString().substring(11, 16)}`);
    console.log(`  Payloads: ${payloadsInHour.length}`);

    const { error } = await supabase
      .rpc('generate_session_wake_snapshot', {
        p_session_id: SESSION_ID,
        p_wake_number: wakeNumber,
        p_wake_round_start: hourStart.toISOString(),
        p_wake_round_end: hourEnd.toISOString()
      });

    if (error) {
      console.error(`  ❌ Error:`, error.message);
    } else {
      console.log(`  ✅ Created`);
      successCount++;
    }

    wakeNumber++;
  }

  console.log(`\n✅ Created ${successCount}/${sortedHours.length} snapshots\n`);

  // Verify
  const { data: verifySnapshots } = await supabase
    .from('session_wake_snapshots')
    .select('wake_number, avg_temperature, avg_humidity, new_images_this_round')
    .eq('session_id', SESSION_ID)
    .order('wake_number');

  if (verifySnapshots && verifySnapshots.length > 0) {
    console.log('📊 Verification:');
    verifySnapshots.forEach(s => {
      console.log(`  Wake #${s.wake_number}: temp=${s.avg_temperature}, humidity=${s.avg_humidity}, images=${s.new_images_this_round || 0}`);
    });

    const withTemp = verifySnapshots.filter(s => s.avg_temperature !== null).length;
    const withImages = verifySnapshots.filter(s => (s.new_images_this_round || 0) > 0).length;

    console.log(`\n  Snapshots with temperature: ${withTemp}/${verifySnapshots.length}`);
    console.log(`  Snapshots with images: ${withImages}/${verifySnapshots.length}\n`);

    if (withTemp > 0 || withImages > 0) {
      console.log('✅ Snapshots have data! Map and analytics should render now.');
    } else {
      console.log('⚠️  Snapshots created but have NO data');
      console.log('   This means the snapshot function is still using device_telemetry');
      console.log('   Apply the migration: fix-snapshot-use-wake-payloads-manual.sql');
    }
  }
}

regenerateSnapshots().catch(console.error);
