#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  const SESSION_ID = '4889eee2-6836-4f52-bbe4-9391e0930f88'; // Jan 4 session we backfilled

  console.log('Verifying Jan 4 session backfill...\n');

  const { data: payloads } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, temperature, humidity, image_id')
    .eq('site_device_session_id', SESSION_ID);

  console.log('Wake Payloads:');
  console.log(`  Total: ${payloads?.length || 0}`);
  console.log(`  With temp: ${payloads?.filter(p => p.temperature !== null).length || 0}`);
  console.log(`  With humidity: ${payloads?.filter(p => p.humidity !== null).length || 0}`);
  console.log(`  With images: ${payloads?.filter(p => p.image_id !== null).length || 0}`);

  const { data: snapshots } = await supabase
    .from('session_wake_snapshots')
    .select('wake_number, avg_temperature, avg_humidity, new_images_this_round')
    .eq('session_id', SESSION_ID)
    .order('wake_number');

  console.log(`\nSnapshots: ${snapshots?.length || 0}`);
  if (snapshots && snapshots.length > 0) {
    snapshots.forEach(s => {
      console.log(`  Wake #${s.wake_number}: temp=${s.avg_temperature}, humidity=${s.avg_humidity}, images=${s.new_images_this_round}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  if (payloads && payloads.some(p => p.temperature !== null)) {
    console.log('✅ Backfill is INTACT');
  } else {
    console.log('❌ Backfill was LOST or never applied');
  }

  if (snapshots && snapshots.some(s => s.avg_temperature !== null)) {
    console.log('✅ Snapshots have telemetry data');
  } else {
    console.log('❌ Snapshots have NO telemetry data');
    console.log('   → Need to apply snapshot function fix and regenerate');
  }
}

verify().catch(console.error);
