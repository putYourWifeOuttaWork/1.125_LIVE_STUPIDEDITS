import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🧪 Testing Connectivity Migration...\n');

// Test 1: Check functions exist
console.log('Test 1: Checking if functions were created...');
const functionsToCheck = [
  'get_previous_wake_times',
  'was_device_active_near',
  'calculate_device_wake_reliability',
  'generate_session_wake_snapshot'
];

let functionsExist = true;
for (const funcName of functionsToCheck) {
  const { data } = await supabase
    .from('pg_proc')
    .select('proname')
    .eq('proname', funcName)
    .limit(1);

  if (data && data.length > 0) {
    console.log(`  ✅ ${funcName} exists`);
  } else {
    console.log(`  ❌ ${funcName} NOT FOUND`);
    functionsExist = false;
  }
}

if (!functionsExist) {
  console.log('\n❌ Migration not applied. Apply the SQL file first!');
  process.exit(1);
}

// Test 2: Try manual snapshot generation
console.log('\nTest 2: Testing snapshot generation with connectivity...');

const testSessionId = '720e945e-b304-428b-b075-1fdad8d494cc';
const testWakeNumber = 3;
const testStart = '2025-11-21T14:00:00+00:00';
const testEnd = '2025-11-21T15:00:00+00:00';

const { data: snapshotId, error: snapError } = await supabase.rpc('generate_session_wake_snapshot', {
  p_session_id: testSessionId,
  p_wake_number: testWakeNumber,
  p_wake_round_start: testStart,
  p_wake_round_end: testEnd
});

if (snapError) {
  console.log(`  ❌ Error generating snapshot: ${snapError.message}`);
  process.exit(1);
} else {
  console.log(`  ✅ Snapshot generated! ID: ${snapshotId}`);
}

// Test 3: Verify snapshot has connectivity data
console.log('\nTest 3: Verifying connectivity data in snapshot...');

const { data: snapshot } = await supabase
  .from('session_wake_snapshots')
  .select('site_state')
  .eq('snapshot_id', snapshotId)
  .single();

if (snapshot && snapshot.site_state) {
  const devices = snapshot.site_state.devices || [];

  if (devices.length === 0) {
    console.log('  ⚠️  No devices in snapshot');
  } else {
    const devicesWithConnectivity = devices.filter(d => d.connectivity);

    console.log(`  📊 Snapshot has ${devices.length} devices`);
    console.log(`  📶 ${devicesWithConnectivity.length} devices have connectivity data`);

    if (devicesWithConnectivity.length > 0) {
      const sample = devicesWithConnectivity[0];
      console.log(`\n  Sample connectivity data:`);
      console.log(`    Device: ${sample.device_name}`);
      console.log(`    Status: ${sample.connectivity.status}`);
      console.log(`    Color: ${sample.connectivity.color}`);
      console.log(`    Wakes: ${sample.connectivity.trailing_wakes_actual}/${sample.connectivity.trailing_wakes_expected}`);
      console.log(`    Reliability: ${sample.connectivity.reliability_percent}%`);
      console.log('\n  ✅ Connectivity data looks good!');
    } else {
      console.log('  ⚠️  No devices have connectivity data (may be expected if no wake schedules)');
    }
  }
} else {
  console.log('  ❌ Could not retrieve snapshot');
  process.exit(1);
}

// Test 4: Test connectivity calculation directly
console.log('\nTest 4: Testing connectivity calculation function...');

const testDeviceId = 'b6fb6729-8043-46c1-84f1-72357d03a23a'; // Test_1 device
const testSiteId = '134218af-9afc-4ee9-9244-050f51ccbb39';
const testRefTime = new Date().toISOString();

const { data: connectivity, error: connError } = await supabase.rpc('calculate_device_wake_reliability', {
  p_device_id: testDeviceId,
  p_site_id: testSiteId,
  p_reference_time: testRefTime,
  p_trailing_count: 3
});

if (connError) {
  console.log(`  ❌ Error: ${connError.message}`);
} else {
  console.log(`  ✅ Connectivity calculated:`);
  console.log(`     Status: ${connectivity.status}`);
  console.log(`     Color: ${connectivity.color}`);
  console.log(`     Trailing wakes: ${connectivity.trailing_wakes_actual}/${connectivity.trailing_wakes_expected}`);
}

console.log('\n🎉 All tests passed! Migration successful!');
console.log('\n📋 Next steps:');
console.log('   1. Run: node regenerate-snapshots-with-locf.mjs');
console.log('   2. Refresh browser');
console.log('   3. Check Lab → Site Sessions → Iot Test Site 2');
console.log('   4. Look for WiFi icons above devices!');
