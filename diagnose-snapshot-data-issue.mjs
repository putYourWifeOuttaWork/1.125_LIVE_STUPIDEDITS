#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseSnapshots() {
  console.log('🔍 Diagnosing snapshot data issue...\n');

  // Get the most recent snapshot
  const { data: snapshot, error: snapErr } = await supabase
    .from('session_wake_snapshots')
    .select('*')
    .order('wake_round_start', { ascending: false })
    .limit(1)
    .single();

  if (snapErr || !snapshot) {
    console.error('❌ No snapshots found:', snapErr);
    return;
  }

  console.log('📊 Most Recent Snapshot:');
  console.log(`   Wake: #${snapshot.wake_number}`);
  console.log(`   Time Range: ${snapshot.wake_round_start} to ${snapshot.wake_round_end}`);
  console.log(`   Site: ${snapshot.site_id}`);
  console.log('');

  const siteState = typeof snapshot.site_state === 'string'
    ? JSON.parse(snapshot.site_state)
    : snapshot.site_state;

  const devices = siteState.devices || [];
  console.log(`📱 Devices in snapshot: ${devices.length}`);

  if (devices.length > 0) {
    const sampleDevice = devices[0];
    console.log('\n🔧 Sample Device from Snapshot:');
    console.log(`   ID: ${sampleDevice.device_id}`);
    console.log(`   Code: ${sampleDevice.device_code}`);
    console.log(`   telemetry: ${sampleDevice.telemetry}`);
    console.log(`   mgi_state: ${sampleDevice.mgi_state}`);
    console.log('');

    // Check if there's ACTUALLY telemetry data for this device
    console.log('🔍 Checking actual database for this device...\n');

    const deviceId = sampleDevice.device_id;
    const wakeEnd = snapshot.wake_round_end;

    // Check telemetry
    const { data: telemetry, error: telErr } = await supabase
      .from('device_telemetry')
      .select('*')
      .eq('device_id', deviceId)
      .lte('captured_at', wakeEnd)
      .order('captured_at', { ascending: false })
      .limit(5);

    console.log('📊 Device Telemetry (latest 5 before wake time):');
    if (telemetry && telemetry.length > 0) {
      console.log(`   ✅ Found ${telemetry.length} records`);
      telemetry.forEach(t => {
        console.log(`   - ${t.captured_at}: Temp=${t.temperature}°F, RH=${t.humidity}%`);
      });
    } else {
      console.log('   ❌ NO telemetry found');
    }
    console.log('');

    // Check images with MGI
    const { data: images, error: imgErr } = await supabase
      .from('device_images')
      .select('*')
      .eq('device_id', deviceId)
      .not('mgi_score', 'is', null)
      .lte('captured_at', wakeEnd)
      .order('captured_at', { ascending: false })
      .limit(5);

    console.log('📸 Device Images with MGI (latest 5 before wake time):');
    if (images && images.length > 0) {
      console.log(`   ✅ Found ${images.length} images`);
      images.forEach(img => {
        console.log(`   - ${img.captured_at}: MGI=${img.mgi_score}, Velocity=${img.mgi_velocity}`);
      });
    } else {
      console.log('   ❌ NO images with MGI found');
    }
    console.log('');

    // Test the exact query that should be in the function
    console.log('🧪 Testing the SQL query manually...\n');

    const { data: testTelemetry, error: testErr } = await supabase
      .from('device_telemetry')
      .select('temperature, humidity, pressure, gas_resistance, wifi_rssi, captured_at')
      .eq('device_id', deviceId)
      .lte('captured_at', wakeEnd)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('📊 Manual Query Result (telemetry):');
    if (testTelemetry) {
      console.log('   ✅ Data found:', testTelemetry);
    } else {
      console.log('   ❌ No data returned');
      if (testErr) console.log('   Error:', testErr);
    }
    console.log('');

    // Check if the snapshot generation function was updated
    console.log('🔍 Checking if function was updated recently...\n');
    console.log('💡 If telemetry/images exist above but snapshot has null,');
    console.log('   the SQL function may not have been applied correctly.\n');
  }
}

diagnoseSnapshots().then(() => process.exit(0));
