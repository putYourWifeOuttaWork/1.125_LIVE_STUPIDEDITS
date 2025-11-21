#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testFunction() {
  console.log('🧪 Testing if snapshot function was updated...\n');

  // Get a session for the IoT Test Site
  const { data: session } = await supabase
    .from('site_device_sessions')
    .select('session_id, site_id')
    .eq('site_id', '4a21ccd9-56c5-48b2-90ca-c5fb756803d6')
    .limit(1)
    .single();

  if (!session) {
    console.log('❌ No session found');
    return;
  }

  console.log(`📝 Using session: ${session.session_id}\n`);

  // Generate a test snapshot for a time we KNOW has data (Nov 15)
  const testWakeStart = new Date('2025-11-15T18:00:00Z');
  const testWakeEnd = new Date('2025-11-15T20:00:00Z');

  console.log(`🔨 Generating test snapshot...`);
  console.log(`   Wake time: ${testWakeStart.toISOString()} to ${testWakeEnd.toISOString()}`);
  console.log(`   (We know telemetry exists at 2025-11-15T17:15:23)\n`);

  const { data: snapshotId, error: genError } = await supabase
    .rpc('generate_session_wake_snapshot', {
      p_session_id: session.session_id,
      p_wake_number: 999,
      p_wake_round_start: testWakeStart.toISOString(),
      p_wake_round_end: testWakeEnd.toISOString()
    });

  if (genError) {
    console.error('❌ Error generating test snapshot:', genError);
    return;
  }

  console.log(`✅ Test snapshot created: ${snapshotId}\n`);

  // Retrieve and check the snapshot
  const { data: testSnapshot } = await supabase
    .from('session_wake_snapshots')
    .select('*')
    .eq('snapshot_id', snapshotId)
    .single();

  if (!testSnapshot) {
    console.log('❌ Could not retrieve test snapshot');
    return;
  }

  const siteState = typeof testSnapshot.site_state === 'string'
    ? JSON.parse(testSnapshot.site_state)
    : testSnapshot.site_state;

  const devices = siteState.devices || [];

  console.log('📊 Test Snapshot Results:');
  console.log(`   Devices: ${devices.length}`);
  console.log(`   Avg Temp: ${testSnapshot.avg_temperature}°F`);
  console.log(`   Avg Humidity: ${testSnapshot.avg_humidity}%`);
  console.log(`   Avg MGI: ${testSnapshot.avg_mgi}\n`);

  if (devices.length > 0) {
    const device = devices[0];
    console.log('🔧 Device Data in Snapshot:');
    console.log(`   Device: ${device.device_code}`);
    console.log(`   telemetry: ${device.telemetry ? '✅ HAS DATA' : '❌ NULL'}`);
    console.log(`   mgi_state: ${device.mgi_state ? '✅ HAS DATA' : '❌ NULL'}\n`);

    if (device.telemetry) {
      console.log('   ✅ SUCCESS! SQL fix was applied correctly!');
      console.log(`   Temperature: ${device.telemetry.temperature}°F`);
      console.log(`   Humidity: ${device.telemetry.humidity}%`);
      console.log(`\n🎉 The function is working! Now regenerate all snapshots:\n`);
      console.log(`   node regenerate-snapshots-with-fix.mjs "IoT Test Site"\n`);
    } else {
      console.log('   ❌ FAILED! SQL fix was NOT applied or has errors');
      console.log('\n📋 Action Required:');
      console.log('   1. Open Supabase SQL Editor');
      console.log('   2. Copy contents of APPLY_SNAPSHOT_FIX_NOW.sql');
      console.log('   3. Execute the SQL');
      console.log('   4. Run this test again\n');
    }
  }

  // Clean up test snapshot
  await supabase
    .from('session_wake_snapshots')
    .delete()
    .eq('snapshot_id', snapshotId);

  console.log('🧹 Test snapshot cleaned up');
}

testFunction().then(() => process.exit(0));
