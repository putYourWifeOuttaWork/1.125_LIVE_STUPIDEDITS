#!/usr/bin/env node
/**
 * Test Device HELLO Message Flow
 * Simulates a device sending HELLO and verifies all data tracking works
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Use service role to bypass RLS for testing
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000001';

console.log('🧪 Testing Device HELLO Message Flow\n');
console.log('This simulates what happens when a device sends a HELLO message\n');

// Step 1: Create or find a test device
console.log('📋 Step 1: Setting up test device...');

const testDeviceMac = 'TEST:DE:VI:CE:00:01';
const testMqttClientId = 'TEST-DEVICE-001';
const testBatteryVoltage = 3.8; // Should calculate to ~67% health
const testWifiRssi = -65; // Good signal

// Check if test device already exists
let { data: existingDevice } = await supabase
  .from('devices')
  .select('*')
  .eq('device_mac', testDeviceMac)
  .maybeSingle();

if (existingDevice) {
  console.log(`   ✅ Using existing test device: ${existingDevice.device_id}`);
} else {
  // Create test device
  const { data: newDevice, error: createError } = await supabase
    .from('devices')
    .insert({
      device_mac: testDeviceMac,
      mqtt_client_id: testMqttClientId,
      device_name: 'Test Device for Validation',
      hardware_version: 'ESP32-S3',
      firmware_version: '1.0.0-test',
      device_type: 'physical',
      provisioning_status: 'pending_mapping',
      is_active: false,
      notes: 'Created for device tracking validation test'
    })
    .select()
    .single();

  if (createError) {
    console.log(`   ❌ Failed to create test device: ${createError.message}`);
    process.exit(1);
  }

  existingDevice = newDevice;
  console.log(`   ✅ Created test device: ${existingDevice.device_id}`);
}

const deviceId = existingDevice.device_id;
console.log(`   Device ID: ${deviceId}`);
console.log(`   Device MAC: ${testDeviceMac}`);

// Step 2: Simulate HELLO message by updating device (like edge function does)
console.log('\n📋 Step 2: Simulating HELLO message...');

const now = new Date().toISOString();

const { error: updateError } = await supabase
  .from('devices')
  .update({
    last_seen_at: now,
    last_wake_at: now,
    is_active: true,
    mqtt_client_id: testMqttClientId,
    battery_voltage: testBatteryVoltage, // Trigger should auto-calculate health
    wifi_rssi: testWifiRssi,
    last_updated_by_user_id: SYSTEM_USER_UUID, // System update
    firmware_version: '1.0.0-test',
    hardware_version: 'ESP32-S3'
  })
  .eq('device_id', deviceId);

if (updateError) {
  console.log(`   ❌ Failed to update device: ${updateError.message}`);
  process.exit(1);
}

console.log('   ✅ Device updated with HELLO data');
console.log(`      Battery Voltage: ${testBatteryVoltage}V`);
console.log(`      WiFi RSSI: ${testWifiRssi} dBm`);
console.log(`      MQTT Client ID: ${testMqttClientId}`);
console.log(`      Last Updated By: System UUID`);

// Step 3: Verify battery health was auto-calculated
console.log('\n📋 Step 3: Verifying battery health auto-calculation...');

const { data: updatedDevice, error: fetchError } = await supabase
  .from('devices')
  .select('battery_voltage, battery_health_percent')
  .eq('device_id', deviceId)
  .single();

if (fetchError) {
  console.log(`   ❌ Failed to fetch device: ${fetchError.message}`);
} else {
  const expectedHealth = Math.max(0, Math.min(100,
    Math.round(((testBatteryVoltage - 3.0) / (4.2 - 3.0)) * 100)
  ));

  console.log(`   Voltage: ${updatedDevice.battery_voltage}V`);
  console.log(`   Health: ${updatedDevice.battery_health_percent}%`);
  console.log(`   Expected: ${expectedHealth}%`);

  if (updatedDevice.battery_health_percent === expectedHealth) {
    console.log('   ✅ Battery health auto-calculated correctly!');
  } else {
    console.log('   ❌ Battery health mismatch!');
  }
}

// Step 4: Test next wake calculation (if device has wake schedule)
console.log('\n📋 Step 4: Testing next wake time calculation...');

// Set a wake schedule
const testWakeCron = '0 */6 * * *'; // Every 6 hours
const { error: schedError } = await supabase
  .from('devices')
  .update({
    wake_schedule_cron: testWakeCron
  })
  .eq('device_id', deviceId);

if (schedError) {
  console.log(`   ❌ Failed to set wake schedule: ${schedError.message}`);
} else {
  console.log(`   ✅ Set wake schedule: ${testWakeCron} (every 6 hours)`);

  // Calculate next wake
  const { data: nextWake, error: calcError } = await supabase.rpc(
    'fn_calculate_next_wake_time',
    {
      p_last_wake_at: now,
      p_cron_expression: testWakeCron,
      p_timezone: 'America/New_York'
    }
  );

  if (calcError) {
    console.log(`   ❌ Failed to calculate next wake: ${calcError.message}`);
  } else {
    console.log(`   ✅ Next wake calculated: ${nextWake}`);

    const nextWakeDate = new Date(nextWake);
    const hoursFromNow = (nextWakeDate - new Date()) / (1000 * 60 * 60);
    console.log(`   Hours from now: ${hoursFromNow.toFixed(2)}`);

    // Update device with calculated next wake
    await supabase
      .from('devices')
      .update({ next_wake_at: nextWake })
      .eq('device_id', deviceId);

    console.log('   ✅ Device updated with next_wake_at');
  }
}

// Step 5: Create telemetry record (like edge function does)
console.log('\n📋 Step 5: Creating telemetry record...');

const { error: telError } = await supabase
  .from('device_telemetry')
  .insert({
    device_id: deviceId,
    company_id: null, // Test device, no company
    captured_at: now,
    battery_voltage: testBatteryVoltage,
    wifi_rssi: testWifiRssi,
    temperature: 22.5,
    humidity: 45.0,
    pressure: 1013.25
  });

if (telError) {
  console.log(`   ❌ Failed to create telemetry: ${telError.message}`);
} else {
  console.log('   ✅ Telemetry record created');
  console.log(`      Temperature: 22.5°C`);
  console.log(`      Humidity: 45.0%`);
  console.log(`      Pressure: 1013.25 hPa`);
}

// Step 6: Verify all data is correct
console.log('\n📋 Step 6: Final verification...');

const { data: finalDevice } = await supabase
  .from('devices')
  .select('*')
  .eq('device_id', deviceId)
  .single();

console.log('\n   Final Device State:');
console.log('   ' + '─'.repeat(50));
console.log(`   Device Name: ${finalDevice.device_name}`);
console.log(`   Device MAC: ${finalDevice.device_mac}`);
console.log(`   MQTT Client ID: ${finalDevice.mqtt_client_id}`);
console.log(`   Battery: ${finalDevice.battery_voltage}V (${finalDevice.battery_health_percent}%)`);
console.log(`   WiFi RSSI: ${finalDevice.wifi_rssi} dBm`);
console.log(`   Last Seen: ${finalDevice.last_seen_at}`);
console.log(`   Last Wake: ${finalDevice.last_wake_at}`);
console.log(`   Next Wake: ${finalDevice.next_wake_at}`);
console.log(`   Wake Schedule: ${finalDevice.wake_schedule_cron}`);
console.log(`   Last Updated By: ${finalDevice.last_updated_by_user_id}`);
console.log(`   Is Active: ${finalDevice.is_active}`);

// Check telemetry count
const { count: telCount } = await supabase
  .from('device_telemetry')
  .select('*', { count: 'exact', head: true })
  .eq('device_id', deviceId);

console.log(`   Telemetry Records: ${telCount || 0}`);

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(60));

const checks = [
  { name: 'Device HELLO update', pass: !updateError },
  { name: 'Battery health auto-calculation', pass: updatedDevice?.battery_health_percent === Math.round(((testBatteryVoltage - 3.0) / 1.2) * 100) },
  { name: 'Next wake calculation', pass: finalDevice.next_wake_at !== null },
  { name: 'WiFi RSSI tracking', pass: finalDevice.wifi_rssi === testWifiRssi },
  { name: 'MQTT Client ID tracking', pass: finalDevice.mqtt_client_id === testMqttClientId },
  { name: 'System user tracking', pass: finalDevice.last_updated_by_user_id === SYSTEM_USER_UUID },
  { name: 'Telemetry recording', pass: !telError },
];

const passedChecks = checks.filter(c => c.pass).length;
const totalChecks = checks.length;

console.log(`\n✅ Passed: ${passedChecks}/${totalChecks} checks\n`);

checks.forEach(check => {
  console.log(`   ${check.pass ? '✅' : '❌'} ${check.name}`);
});

if (passedChecks === totalChecks) {
  console.log('\n🎉 All tests passed! Device data flow is working correctly.');
} else {
  console.log('\n⚠️  Some tests failed. Check the results above.');
}

console.log('\n💡 Tip: Check the device in Supabase dashboard to see all fields populated');
