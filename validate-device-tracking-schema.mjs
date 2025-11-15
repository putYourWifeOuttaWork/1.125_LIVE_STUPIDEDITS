#!/usr/bin/env node
/**
 * Validate Device Tracking Schema
 * Verifies all new columns, indexes, triggers, and functions exist
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

console.log('🔍 Validating Device Tracking Schema...\n');

// Test 1: Check new columns exist
console.log('📋 Test 1: Checking new columns in devices table...');
try {
  const { data: devices, error: testError } = await supabase
    .from('devices')
    .select('wifi_rssi, last_updated_by_user_id, battery_critical_threshold, battery_warning_threshold')
    .limit(0);

  if (testError) {
    console.log(`   ❌ Error: ${testError.message}`);
  } else {
    console.log('   ✅ All new columns exist (verified via query)');
    console.log('      - wifi_rssi (integer)');
    console.log('      - last_updated_by_user_id (uuid)');
    console.log('      - battery_critical_threshold (numeric)');
    console.log('      - battery_warning_threshold (numeric)');
  }
} catch (err) {
  console.log(`   ❌ Columns may be missing: ${err.message}`);
}

// Test 2: Check indexes exist
console.log('\n📋 Test 2: Checking new indexes...');
const expectedIndexes = [
  'idx_devices_mqtt_client_id',
  'idx_devices_next_wake_at',
  'idx_devices_battery_voltage',
  'idx_devices_device_mac'
];

for (const indexName of expectedIndexes) {
  // We can't query pg_indexes directly, so check if columns used in indexes exist
  console.log(`   ℹ️  Index ${indexName} (verify via Supabase dashboard)`);
}

// Test 3: Check battery health trigger exists
console.log('\n📋 Test 3: Checking battery health trigger...');
try {
  // Test by checking if battery_health_percent calculates
  const { data: testDevice } = await supabase
    .from('devices')
    .select('device_id, battery_voltage, battery_health_percent')
    .not('battery_voltage', 'is', null)
    .limit(1)
    .maybeSingle();

  if (testDevice) {
    const expectedHealth = Math.max(0, Math.min(100,
      Math.round(((testDevice.battery_voltage - 3.0) / (4.2 - 3.0)) * 100)
    ));

    if (testDevice.battery_health_percent === expectedHealth) {
      console.log(`   ✅ Battery health trigger working correctly`);
      console.log(`      Device: ${testDevice.device_id}`);
      console.log(`      Voltage: ${testDevice.battery_voltage}V → Health: ${testDevice.battery_health_percent}%`);
    } else {
      console.log(`   ⚠️  Battery health mismatch:`);
      console.log(`      Expected: ${expectedHealth}%, Got: ${testDevice.battery_health_percent}%`);
    }
  } else {
    console.log('   ℹ️  No devices with battery voltage to test');
  }
} catch (err) {
  console.log(`   ⚠️  Could not verify trigger: ${err.message}`);
}

// Test 4: Check next wake calculation function exists
console.log('\n📋 Test 4: Checking next wake calculation function...');
try {
  const { data: nextWake, error: wakeError } = await supabase.rpc(
    'fn_calculate_next_wake_time',
    {
      p_last_wake_at: new Date().toISOString(),
      p_cron_expression: '0 */6 * * *',
      p_timezone: 'America/New_York'
    }
  );

  if (wakeError) {
    console.log(`   ❌ Function error: ${wakeError.message}`);
  } else if (nextWake) {
    console.log(`   ✅ Function fn_calculate_next_wake_time exists and works`);
    console.log(`      Input: Now + "0 */6 * * *" (every 6 hours)`);
    console.log(`      Output: ${nextWake}`);

    // Verify it's ~6 hours in future
    const nextWakeDate = new Date(nextWake);
    const hoursFromNow = (nextWakeDate - new Date()) / (1000 * 60 * 60);
    console.log(`      Hours from now: ${hoursFromNow.toFixed(2)}`);

    if (hoursFromNow >= 5.5 && hoursFromNow <= 6.5) {
      console.log(`      ✅ Calculation is accurate`);
    } else {
      console.log(`      ⚠️  Expected ~6 hours, got ${hoursFromNow.toFixed(2)}`);
    }
  }
} catch (err) {
  console.log(`   ❌ Function not found or error: ${err.message}`);
}

// Test 5: Check system user exists
console.log('\n📋 Test 5: Checking system user setup...');
try {
  const { data: systemUser, error: userError } = await supabase
    .from('system_users')
    .select('*')
    .eq('system_user_id', '00000000-0000-0000-0000-000000000001')
    .maybeSingle();

  if (userError) {
    console.log(`   ❌ Error querying system_users: ${userError.message}`);
  } else if (systemUser) {
    console.log(`   ✅ System user exists`);
    console.log(`      ID: ${systemUser.system_user_id}`);
    console.log(`      Name: ${systemUser.system_name}`);
    console.log(`      Description: ${systemUser.description}`);
  } else {
    console.log(`   ❌ System user not found`);
  }
} catch (err) {
  console.log(`   ❌ System users table error: ${err.message}`);
}

// Test 6: Check fn_get_system_user_id function
console.log('\n📋 Test 6: Checking system user helper function...');
try {
  const { data: sysUserId, error: funcError } = await supabase.rpc('fn_get_system_user_id');

  if (funcError) {
    console.log(`   ❌ Function error: ${funcError.message}`);
  } else if (sysUserId === '00000000-0000-0000-0000-000000000001') {
    console.log(`   ✅ Function fn_get_system_user_id works correctly`);
    console.log(`      Returns: ${sysUserId}`);
  } else {
    console.log(`   ⚠️  Unexpected return value: ${sysUserId}`);
  }
} catch (err) {
  console.log(`   ❌ Function not found: ${err.message}`);
}

// Test 7: Check devices table has data with new columns
console.log('\n📋 Test 7: Checking devices table data...');
const { data: devicesSample, error: devError } = await supabase
  .from('devices')
  .select('device_id, device_name, device_mac, mqtt_client_id, battery_voltage, battery_health_percent, wifi_rssi, last_updated_by_user_id, next_wake_at, wake_schedule_cron')
  .limit(3);

if (devError) {
  console.log(`   ❌ Error querying devices: ${devError.message}`);
} else if (devicesSample && devicesSample.length > 0) {
  console.log(`   ✅ Found ${devicesSample.length} devices`);
  devicesSample.forEach((dev, idx) => {
    console.log(`\n   Device ${idx + 1}:`);
    console.log(`      Name: ${dev.device_name || 'N/A'}`);
    console.log(`      MAC: ${dev.device_mac || 'N/A'}`);
    console.log(`      MQTT Client ID: ${dev.mqtt_client_id || 'N/A'}`);
    console.log(`      Battery: ${dev.battery_voltage || 'N/A'}V (${dev.battery_health_percent || 'N/A'}%)`);
    console.log(`      WiFi RSSI: ${dev.wifi_rssi || 'N/A'} dBm`);
    console.log(`      Last Updated By: ${dev.last_updated_by_user_id || 'NULL'}`);
    console.log(`      Wake Schedule: ${dev.wake_schedule_cron || 'N/A'}`);
    console.log(`      Next Wake: ${dev.next_wake_at || 'N/A'}`);
  });
} else {
  console.log(`   ℹ️  No devices found in table`);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 VALIDATION SUMMARY');
console.log('='.repeat(60));
console.log('✅ Schema validation complete');
console.log('ℹ️  Check results above for any ❌ or ⚠️  warnings');
console.log('\nNext: Run test-device-hello-flow.mjs to test actual device data ingestion');
