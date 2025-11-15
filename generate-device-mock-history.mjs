#!/usr/bin/env node
/**
 * Generate mock device history for testing
 * - 10 wake sessions
 * - Environmental telemetry for each wake
 * - Device images
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // Use service role for direct DB access
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

console.log('✅ Using service role key for direct DB access');

// Get the test device
async function getTestDevice() {
  const { data: devices, error } = await supabase
    .from('devices')
    .select('*, sites!devices_site_id_fkey(timezone)')
    .eq('device_type', 'physical')
    .not('site_id', 'is', null)
    .not('program_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !devices || devices.length === 0) {
    console.error('❌ No device with site/program found');
    console.error('Error:', error);
    process.exit(1);
  }

  return devices[0];
}

// Generate realistic environmental data with variation
function generateEnvironmentalData(baseTime, variation = 1) {
  const baseTemp = 72;
  const baseHumidity = 50;
  const basePressure = 1013;
  const baseGas = 150000;

  return {
    temperature: baseTemp + (Math.random() - 0.5) * 10 * variation,
    humidity: Math.max(20, Math.min(80, baseHumidity + (Math.random() - 0.5) * 20 * variation)),
    pressure: basePressure + (Math.random() - 0.5) * 20 * variation,
    gas_resistance: baseGas + (Math.random() - 0.5) * 50000 * variation,
    battery_voltage: 3.7 + (Math.random() - 0.5) * 0.4,
    wifi_rssi: -60 + (Math.random() - 0.5) * 20
  };
}

async function generateMockHistory() {
  console.log('🚀 Starting mock data generation...\n');

  const device = await getTestDevice();

  console.log(`📱 Device: ${device.device_name || device.device_mac}`);
  console.log(`🏢 Site: ${device.site_id}`);
  console.log(`📋 Program: ${device.program_id}\n`);

  const sessions = [];
  const telemetryRecords = [];
  const now = new Date();

  // Generate 10 wake sessions over the past 7 days
  for (let i = 9; i >= 0; i--) {
    const wakeTime = new Date(now.getTime() - i * 6 * 60 * 60 * 1000); // Every 6 hours
    const sessionDuration = 45 + Math.random() * 30; // 45-75 seconds

    console.log(`📅 Generating session ${10 - i}/10 at ${wakeTime.toISOString()}`);

    // Create session
    const { data: session, error: sessionError } = await supabase
      .from('site_device_sessions')
      .insert({
        device_id: device.device_id,
        site_id: device.site_id,
        program_id: device.program_id,
        session_date: wakeTime.toISOString().split('T')[0],
        wake_time_actual: wakeTime.toISOString(),
        wake_time_expected: wakeTime.toISOString(),
        session_status: 'completed',
        images_expected: 2,
        images_received: 2,
        session_duration_seconds: Math.floor(sessionDuration),
        created_at: wakeTime.toISOString()
      })
      .select()
      .single();

    if (sessionError) {
      console.error(`❌ Session creation failed:`, sessionError);
      continue;
    }

    sessions.push(session);
    console.log(`  ✅ Session created: ${session.session_id}`);

    // Generate 5-10 telemetry readings during session
    const numReadings = 5 + Math.floor(Math.random() * 6);
    for (let j = 0; j < numReadings; j++) {
      const readingTime = new Date(wakeTime.getTime() + (j * sessionDuration * 1000 / numReadings));
      const envData = generateEnvironmentalData(readingTime, 1 + j * 0.1);

      const telemetry = {
        device_id: device.device_id,
        site_id: device.site_id,
        program_id: device.program_id,
        site_device_session_id: session.session_id,
        captured_at: readingTime.toISOString(),
        ...envData
      };

      telemetryRecords.push(telemetry);
    }

    // Generate 2 device images
    for (let imgNum = 1; imgNum <= 2; imgNum++) {
      const imageTime = new Date(wakeTime.getTime() + imgNum * 15000); // 15s apart

      const { error: imageError } = await supabase
        .from('device_images')
        .insert({
          device_id: device.device_id,
          site_id: device.site_id,
          program_id: device.program_id,
          site_device_session_id: session.session_id,
          image_name: `mock_${session.session_id}_img${imgNum}.jpg`,
          image_type: 'petri_dish',
          status: 'received',
          storage_path: `device-images/${device.device_id}/mock_${session.session_id}_img${imgNum}.jpg`,
          captured_at: imageTime.toISOString(),
          received_at: imageTime.toISOString(),
          file_size_bytes: 150000 + Math.floor(Math.random() * 50000),
          retry_count: 0,
          max_retries: 3
        });

      if (imageError) {
        console.error(`  ❌ Image ${imgNum} failed:`, imageError);
      } else {
        console.log(`  📸 Image ${imgNum} created`);
      }
    }

    console.log(`  📊 ${numReadings} telemetry readings queued\n`);
  }

  // Bulk insert telemetry
  console.log(`📊 Inserting ${telemetryRecords.length} telemetry records...`);
  const { error: telemetryError } = await supabase
    .from('device_telemetry')
    .insert(telemetryRecords);

  if (telemetryError) {
    console.error('❌ Telemetry insertion failed:', telemetryError);
  } else {
    console.log(`✅ ${telemetryRecords.length} telemetry records inserted`);
  }

  // Update device last_seen_at
  await supabase
    .from('devices')
    .update({
      last_seen_at: now.toISOString(),
      last_wake_at: now.toISOString()
    })
    .eq('device_id', device.device_id);

  console.log('\n✅ Mock data generation complete!');
  console.log('\n📈 Summary:');
  console.log(`  • Sessions: ${sessions.length}`);
  console.log(`  • Telemetry: ${telemetryRecords.length}`);
  console.log(`  • Images: ${sessions.length * 2}`);
  console.log('\n🎨 Navigate to Device Detail > Environmental tab to see the data!');
}

generateMockHistory().catch(console.error);
