#!/usr/bin/env node
/**
 * Test Battery Health Trigger
 * Tests the auto-calculation of battery health % from voltage
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

console.log('🔋 Testing Battery Health Auto-Calculation Trigger\n');

// Get test device
const { data: testDevice } = await supabase
  .from('devices')
  .select('device_id, device_name')
  .eq('device_mac', 'TEST:DE:VI:CE:00:01')
  .maybeSingle();

if (!testDevice) {
  console.log('❌ Test device not found. Run test-device-hello-flow.mjs first');
  process.exit(1);
}

console.log(`Using test device: ${testDevice.device_name} (${testDevice.device_id})\n`);

// Test different battery voltages
const testCases = [
  { voltage: 4.2, expectedHealth: 100, description: 'Fully charged' },
  { voltage: 4.0, expectedHealth: 83, description: 'High' },
  { voltage: 3.8, expectedHealth: 67, description: 'Good' },
  { voltage: 3.7, expectedHealth: 58, description: 'Nominal' },
  { voltage: 3.6, expectedHealth: 50, description: 'Warning threshold' },
  { voltage: 3.4, expectedHealth: 33, description: 'Critical threshold' },
  { voltage: 3.2, expectedHealth: 17, description: 'Very low' },
  { voltage: 3.0, expectedHealth: 0, description: 'Dead' },
  { voltage: 2.8, expectedHealth: 0, description: 'Below minimum (clamped)' },
  { voltage: 4.5, expectedHealth: 100, description: 'Above maximum (clamped)' },
];

console.log('Testing battery health calculation for different voltages:\n');
console.log('Voltage | Expected | Actual | Status | Description');
console.log('─'.repeat(70));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  // Update battery voltage
  const { error: updateError } = await supabase
    .from('devices')
    .update({ battery_voltage: testCase.voltage })
    .eq('device_id', testDevice.device_id);

  if (updateError) {
    console.log(`${testCase.voltage}V | ERROR: ${updateError.message}`);
    failed++;
    continue;
  }

  // Fetch updated device
  const { data: updated } = await supabase
    .from('devices')
    .select('battery_health_percent')
    .eq('device_id', testDevice.device_id)
    .single();

  const match = updated.battery_health_percent === testCase.expectedHealth;
  const status = match ? '✅' : '❌';

  if (match) passed++;
  else failed++;

  console.log(
    `${testCase.voltage.toFixed(1)}V  | ${String(testCase.expectedHealth).padStart(3)}%     | ` +
    `${String(updated.battery_health_percent).padStart(3)}%    | ${status}     | ${testCase.description}`
  );
}

// Test NULL voltage
console.log('\nTesting NULL voltage handling:');
const { error: nullError } = await supabase
  .from('devices')
  .update({ battery_voltage: null })
  .eq('device_id', testDevice.device_id);

if (nullError) {
  console.log(`❌ Error setting NULL voltage: ${nullError.message}`);
  failed++;
} else {
  const { data: nullDevice } = await supabase
    .from('devices')
    .select('battery_health_percent')
    .eq('device_id', testDevice.device_id)
    .single();

  if (nullDevice.battery_health_percent === null) {
    console.log('✅ NULL voltage → NULL health (correct)');
    passed++;
  } else {
    console.log(`❌ NULL voltage → ${nullDevice.battery_health_percent}% health (should be NULL)`);
    failed++;
  }
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 TRIGGER TEST SUMMARY');
console.log('='.repeat(60));
console.log(`✅ Passed: ${passed}/${passed + failed} tests`);
console.log(`❌ Failed: ${failed}/${passed + failed} tests\n`);

if (failed === 0) {
  console.log('🎉 Battery health trigger is working perfectly!');
  console.log('\n✅ Verified:');
  console.log('   - Correct formula: ((voltage - 3.0) / (4.2 - 3.0)) * 100');
  console.log('   - Clamping to 0-100 range');
  console.log('   - NULL handling');
  console.log('   - Trigger executes on every voltage update');
} else {
  console.log('⚠️  Some tests failed. Check results above.');
}
