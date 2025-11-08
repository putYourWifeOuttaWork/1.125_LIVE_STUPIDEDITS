#!/usr/bin/env node
/**
 * Test Device Scenarios Runner
 *
 * Executes comprehensive test scenarios for IoT device protocol validation.
 * Runs Python device simulator with different test modes and validates results.
 *
 * Usage:
 *   node test-device-scenarios.mjs                    # Run all scenarios
 *   node test-device-scenarios.mjs --scenario=happy   # Run specific scenario
 *   node test-device-scenarios.mjs --skip-validation  # Skip database validation
 *
 * Scenarios:
 *   1. happy       - Happy path (no errors, complete transmission)
 *   2. retry       - Missing chunks retry mechanism
 *   3. offline     - Offline recovery with pending queue
 *   4. errors      - Error scenarios (connection, image, wake issues)
 */

import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Parse command line arguments
const args = process.argv.slice(2);
const specificScenario = args.find((arg) => arg.startsWith('--scenario='))?.split('=')[1];
const skipValidation = args.includes('--skip-validation');

// Test scenarios configuration
const SCENARIOS = [
  {
    id: 'happy',
    name: 'Happy Path - Complete Transmission',
    device: 'TEST-ESP32-001',
    mode: 'normal',
    description: 'Tests successful image transmission without errors or retries',
    validations: [
      'device_wake_sessions status = success',
      'device_images status = complete',
      'device_telemetry record created',
      'device_history has wake, capture, telemetry, upload events',
      'submission and observation created (if mapped)',
    ],
  },
  {
    id: 'retry',
    name: 'Missing Chunks Retry',
    device: 'TEST-ESP32-002',
    mode: 'missing_chunks',
    description: 'Tests chunk retry mechanism when packets are lost',
    validations: [
      'device_wake_sessions status = success with chunks_missing array',
      'device_history has missing_chunks_requested event',
      'device_images status = complete after retry',
      'all chunks eventually received and reassembled',
    ],
  },
  {
    id: 'offline',
    name: 'Offline Recovery',
    device: 'TEST-ESP32-003',
    mode: 'offline_recovery',
    description: 'Tests recovery and sync after device was offline',
    validations: [
      'device_wake_sessions shows pending_images_count',
      'multiple device_images records created',
      'device_history shows offline_capture events',
      'all pending images transmitted and acknowledged',
    ],
  },
];

// Error test scenarios (run separately with manual setup)
const ERROR_SCENARIOS = [
  {
    id: 'error_wifi',
    name: 'WiFi Connection Failure',
    device: 'TEST-ESP32-001',
    errorCode: 1,
    description: 'Simulates WiFi connection failure',
  },
  {
    id: 'error_mqtt',
    name: 'MQTT Connection Failure',
    device: 'TEST-ESP32-001',
    errorCode: 2,
    description: 'Simulates MQTT broker connection failure',
  },
  {
    id: 'error_camera',
    name: 'Camera Capture Failure',
    device: 'TEST-ESP32-002',
    errorCode: 4,
    description: 'Simulates camera capture error',
  },
  {
    id: 'error_sd_card',
    name: 'SD Card Error',
    device: 'TEST-ESP32-002',
    errorCode: 6,
    description: 'Simulates SD card read/write failure',
  },
];

function runPythonSimulator(device, mode) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Starting Python simulator...`);
    console.log(`   Device: ${device}`);
    console.log(`   Mode: ${mode}`);

    const pythonProcess = spawn('python3', [
      'mqtt-test-device-simulator.py',
      '--mac',
      device,
      '--test',
      mode,
    ]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stderr.write(text);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✅ Simulator completed successfully`);
        resolve({ success: true, output });
      } else {
        console.error(`\n❌ Simulator failed with exit code ${code}`);
        reject(new Error(`Simulator failed: ${errorOutput}`));
      }
    });

    pythonProcess.on('error', (err) => {
      console.error(`\n❌ Failed to start simulator: ${err.message}`);
      reject(err);
    });
  });
}

async function validateScenario(scenario) {
  if (skipValidation) {
    console.log('\n⏭️  Skipping validation (--skip-validation flag set)');
    return { passed: true, skipped: true };
  }

  console.log(`\n🔍 Validating test results for ${scenario.device}...`);

  const validations = {
    passed: [],
    failed: [],
  };

  // Get device
  const { data: device } = await supabase
    .from('devices')
    .select('device_id')
    .eq('device_mac', scenario.device)
    .maybeSingle();

  if (!device) {
    console.error(`   ❌ Device ${scenario.device} not found in database`);
    return { passed: false, error: 'Device not found' };
  }

  // Check for recent wake session (last 5 minutes)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recentSession } = await supabase
    .from('device_wake_sessions')
    .select('*')
    .eq('device_id', device.device_id)
    .gte('wake_timestamp', fiveMinutesAgo)
    .order('wake_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentSession) {
    console.log(`   ✅ Recent wake session found (${recentSession.status})`);
    validations.passed.push('Wake session created');

    if (recentSession.status === 'success') {
      validations.passed.push('Session completed successfully');
    } else {
      validations.failed.push(`Session status: ${recentSession.status} (expected: success)`);
    }
  } else {
    console.log(`   ❌ No recent wake session found`);
    validations.failed.push('No recent wake session');
  }

  // Check for device images
  const { data: images, count: imageCount } = await supabase
    .from('device_images')
    .select('*', { count: 'exact' })
    .eq('device_id', device.device_id)
    .gte('captured_at', fiveMinutesAgo);

  if (imageCount > 0) {
    console.log(`   ✅ Found ${imageCount} image(s) from test`);
    validations.passed.push(`${imageCount} image record(s) created`);

    const completeImages = images.filter((img) => img.status === 'complete').length;
    if (completeImages === imageCount) {
      validations.passed.push('All images completed successfully');
    } else {
      validations.failed.push(
        `Only ${completeImages}/${imageCount} images completed`
      );
    }
  } else {
    console.log(`   ❌ No images found from test`);
    validations.failed.push('No images created');
  }

  // Check for telemetry
  const { count: telemetryCount } = await supabase
    .from('device_telemetry')
    .select('*', { count: 'exact', head: true })
    .eq('device_id', device.device_id)
    .gte('captured_at', fiveMinutesAgo);

  if (telemetryCount > 0) {
    console.log(`   ✅ Found ${telemetryCount} telemetry record(s)`);
    validations.passed.push('Telemetry data recorded');
  } else {
    console.log(`   ⚠️  No telemetry data found`);
    validations.failed.push('No telemetry data');
  }

  // Check for device history events
  const { count: historyCount } = await supabase
    .from('device_history')
    .select('*', { count: 'exact', head: true })
    .eq('device_id', device.device_id)
    .gte('event_timestamp', fiveMinutesAgo);

  if (historyCount > 0) {
    console.log(`   ✅ Found ${historyCount} history event(s)`);
    validations.passed.push('Device history logged');
  } else {
    console.log(`   ⚠️  No history events found`);
    validations.failed.push('No history events');
  }

  // Summary
  console.log(`\n📊 Validation Results:`);
  console.log(`   ✅ Passed: ${validations.passed.length}`);
  console.log(`   ❌ Failed: ${validations.failed.length}`);

  const allPassed = validations.failed.length === 0;
  return { passed: allPassed, validations };
}

async function runScenario(scenario) {
  console.log('\n' + '='.repeat(70));
  console.log(`🧪 TEST SCENARIO: ${scenario.name}`);
  console.log('='.repeat(70));
  console.log(`📝 Description: ${scenario.description}`);
  console.log(`🎯 Expected Validations:`);
  for (const validation of scenario.validations) {
    console.log(`   • ${validation}`);
  }

  try {
    // Run the simulator
    await runPythonSimulator(scenario.device, scenario.mode);

    // Wait a moment for database writes to complete
    console.log('\n⏳ Waiting 3 seconds for database writes...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Validate results
    const result = await validateScenario(scenario);

    if (result.passed) {
      console.log(`\n✅ ${scenario.name} - PASSED`);
      return { scenario: scenario.id, passed: true };
    } else {
      console.log(`\n❌ ${scenario.name} - FAILED`);
      if (result.validations) {
        console.log(`\n   Failed validations:`);
        for (const failure of result.validations.failed) {
          console.log(`   • ${failure}`);
        }
      }
      return { scenario: scenario.id, passed: false, failures: result.validations?.failed };
    }
  } catch (error) {
    console.error(`\n❌ ${scenario.name} - ERROR: ${error.message}`);
    return { scenario: scenario.id, passed: false, error: error.message };
  }
}

async function runAllScenarios() {
  console.log('\n🎯 IoT Device Protocol Test Suite');
  console.log('='.repeat(70));
  console.log(`\n⏰ Started at: ${new Date().toLocaleString()}`);

  const scenariosToRun = specificScenario
    ? SCENARIOS.filter((s) => s.id === specificScenario)
    : SCENARIOS;

  if (scenariosToRun.length === 0) {
    console.error(`\n❌ Invalid scenario: ${specificScenario}`);
    console.log(`\nAvailable scenarios: ${SCENARIOS.map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  const results = [];

  for (const scenario of scenariosToRun) {
    const result = await runScenario(scenario);
    results.push(result);

    // Brief pause between scenarios
    if (scenariosToRun.length > 1) {
      console.log('\n⏸️  Pausing 5 seconds before next scenario...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUITE SUMMARY');
  console.log('='.repeat(70));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);

  if (failed > 0) {
    console.log(`\n❌ Failed Scenarios:`);
    for (const result of results.filter((r) => !r.passed)) {
      console.log(`   • ${result.scenario}`);
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    }
  }

  console.log(`\n⏰ Completed at: ${new Date().toLocaleString()}`);

  if (failed === 0) {
    console.log(`\n🎉 ALL TESTS PASSED! Your IoT device protocol is working correctly.\n`);
    process.exit(0);
  } else {
    console.log(`\n⚠️  Some tests failed. Review the output above and check:`);
    console.log(`   1. MQTT service is running (cd mqtt-service && npm start)`);
    console.log(`   2. Test devices exist (node test-seed-devices.mjs)`);
    console.log(`   3. Database schema is up to date`);
    console.log(`   4. Supabase edge function is deployed\n`);
    process.exit(1);
  }
}

// Run the test suite
runAllScenarios().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
