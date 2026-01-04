#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const SESSION_ID = 'e35a3acf-6a14-4251-8c7c-461bcda62366'; // Jan 3 session with 13 completed wakes

async function checkSession() {
  console.log(`🔍 Checking session: ${SESSION_ID}\n`);

  // Get session details
  const { data: session } = await supabase
    .from('site_device_sessions')
    .select('*, sites(name, site_code)')
    .eq('session_id', SESSION_ID)
    .single();

  if (!session) {
    console.error('Session not found');
    return;
  }

  console.log(`Site: ${session.sites.name} (${session.sites.site_code})`);
  console.log(`Date: ${session.session_date}`);
  console.log(`Completed wakes: ${session.completed_wake_count}\n`);

  // Check snapshots
  const { data: snapshots } = await supabase
    .from('session_wake_snapshots')
    .select('snapshot_id, wake_number, avg_temperature, avg_humidity, new_images_this_round')
    .eq('session_id', SESSION_ID)
    .order('wake_number');

  console.log(`📸 Snapshots: ${snapshots?.length || 0}`);
  if (snapshots && snapshots.length > 0) {
    snapshots.forEach(s => {
      console.log(`  Wake #${s.wake_number}: Temp=${s.avg_temperature || 'null'}, Humidity=${s.avg_humidity || 'null'}, Images=${s.new_images_this_round || 0}`);
    });
  }

  // Check wake payloads
  const { data: payloads } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, temperature, humidity, image_id, captured_at')
    .eq('site_device_session_id', SESSION_ID)
    .order('captured_at')
    .limit(10);

  console.log(`\n📡 Wake Payloads: ${payloads?.length || 0}`);
  if (payloads && payloads.length > 0) {
    const withTemp = payloads.filter(p => p.temperature !== null).length;
    const withHumidity = payloads.filter(p => p.humidity !== null).length;
    const withImages = payloads.filter(p => p.image_id !== null).length;
    console.log(`  With temperature: ${withTemp}`);
    console.log(`  With humidity: ${withHumidity}`);
    console.log(`  With images: ${withImages}`);

    console.log('\nFirst 3 payloads:');
    payloads.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.captured_at}`);
      console.log(`     Temp: ${p.temperature}, Humidity: ${p.humidity}, Image: ${p.image_id ? 'YES' : 'NO'}`);
    });
  }

  // Check raw telemetry
  const { data: telemetry } = await supabase
    .from('device_telemetry')
    .select('telemetry_id, temperature, humidity, captured_at')
    .eq('site_id', session.site_id)
    .gte('captured_at', session.session_start_time)
    .lte('captured_at', session.session_end_time)
    .limit(5);

  console.log(`\n📊 Raw Telemetry: ${telemetry?.length || 0}`);

  // Check images
  const { data: images } = await supabase
    .from('device_images')
    .select('image_id, status, mgi_score, captured_at')
    .eq('site_id', session.site_id)
    .gte('captured_at', session.session_start_time)
    .lte('captured_at', session.session_end_time)
    .limit(5);

  console.log(`🖼️  Raw Images: ${images?.length || 0}`);

  console.log('\n' + '='.repeat(80));
  if ((!payloads || payloads.length === 0) && (telemetry && telemetry.length > 0)) {
    console.log('❌ ISSUE: Telemetry exists but no wake payloads!');
    console.log('   Need to backfill this session');
  } else if (payloads && payloads.length > 0 && payloads.every(p => p.temperature === null)) {
    console.log('❌ ISSUE: Wake payloads exist but telemetry fields are NULL!');
    console.log('   Need to backfill this session');
  } else if (snapshots && snapshots.length > 0 && snapshots.every(s => s.avg_temperature === null)) {
    console.log('❌ ISSUE: Snapshots exist but have NULL telemetry!');
    console.log('   Need to regenerate snapshots');
  } else if (snapshots && snapshots.length === 0) {
    console.log('❌ ISSUE: No snapshots exist!');
    console.log('   Need to generate snapshots');
  } else {
    console.log('✅ Data looks good!');
  }
}

checkSession().catch(console.error);
