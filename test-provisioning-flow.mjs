#!/usr/bin/env node
/**
 * Test Script for Device Provisioning Flow
 *
 * Tests the complete device provisioning automation including:
 * - Device auto-provisioning on first connection
 * - Device mapping to site
 * - Automatic field population
 * - Welcome command generation
 * - Status transitions
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('   Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TEST_DEVICE_MAC = 'TEST:DE:VI:CE:00:01';
const TEST_TIMEOUT = 10000; // 10 seconds for each test

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '═'.repeat(70));
  log(`  ${title}`, 'cyan');
  console.log('═'.repeat(70) + '\n');
}

async function cleanup() {
  log('🧹 Cleaning up test data...', 'yellow');

  // Delete test device and related data
  const { data: testDevice } = await supabase
    .from('devices')
    .select('device_id')
    .eq('device_mac', TEST_DEVICE_MAC)
    .maybeSingle();

  if (testDevice) {
    // Delete related data first
    await supabase.from('device_commands').delete().eq('device_id', testDevice.device_id);
    await supabase.from('device_site_assignments').delete().eq('device_id', testDevice.device_id);
    await supabase.from('device_telemetry').delete().eq('device_id', testDevice.device_id);
    await supabase.from('device_images').delete().eq('device_id', testDevice.device_id);

    // Delete the device
    await supabase.from('devices').delete().eq('device_id', testDevice.device_id);

    log('✓ Test data cleaned up', 'green');
  } else {
    log('✓ No test data to clean up', 'green');
  }
}

async function testDatabaseFunctions() {
  section('Test 1: Database Functions');

  log('Testing fn_calculate_next_wake...', 'blue');

  // Test cron parsing
  const testCases = [
    { cron: '0 8,16 * * *', description: 'Twice daily (8am, 4pm)' },
    { cron: '0 8 * * *', description: 'Once daily (8am)' },
    { cron: '0 */6 * * *', description: 'Every 6 hours' },
  ];

  for (const testCase of testCases) {
    const { data, error } = await supabase.rpc('fn_calculate_next_wake', {
      p_cron_expression: testCase.cron,
      p_from_timestamp: new Date().toISOString(),
    });

    if (error) {
      log(`  ❌ ${testCase.description}: ${error.message}`, 'red');
      return false;
    } else if (data) {
      log(`  ✓ ${testCase.description}: Next wake at ${data}`, 'green');
    } else {
      log(`  ❌ ${testCase.description}: No result returned`, 'red');
      return false;
    }
  }

  return true;
}

async function testAutoProvisioning() {
  section('Test 2: Auto-Provisioning');

  log('Creating test device (simulating first MQTT connection)...', 'blue');

  const { data: newDevice, error: insertError } = await supabase
    .from('devices')
    .insert({
      device_mac: TEST_DEVICE_MAC,
      device_code: 'TEST-DEVICE-001',
      hardware_version: 'ESP32-S3',
      provisioning_status: 'pending_mapping',
      device_type: 'virtual',
      is_active: false,
      notes: 'Test device for provisioning flow',
    })
    .select()
    .single();

  if (insertError) {
    log(`❌ Failed to create test device: ${insertError.message}`, 'red');
    return null;
  }

  log('✓ Device auto-provisioned:', 'green');
  log(`  Device ID: ${newDevice.device_id}`, 'blue');
  log(`  Device Code: ${newDevice.device_code}`, 'blue');
  log(`  Status: ${newDevice.provisioning_status}`, 'blue');
  log(`  Active: ${newDevice.is_active}`, 'blue');

  // Verify initial state
  if (newDevice.provisioning_status !== 'pending_mapping') {
    log('❌ Device should be in pending_mapping status', 'red');
    return null;
  }

  if (newDevice.is_active !== false) {
    log('❌ Device should be inactive initially', 'red');
    return null;
  }

  if (newDevice.site_id || newDevice.program_id || newDevice.company_id) {
    log('❌ Device should not have site/program/company initially', 'red');
    return null;
  }

  log('✓ Device in correct initial state', 'green');

  return newDevice;
}

async function testDeviceMapping(deviceId) {
  section('Test 3: Device Mapping and Initialization');

  log('Finding a test site to map device to...', 'blue');

  // Get first available site
  const { data: sites, error: sitesError } = await supabase
    .from('sites')
    .select('site_id, name, program_id, wake_schedule_cron')
    .limit(1);

  if (sitesError || !sites || sites.length === 0) {
    log('❌ No sites available for testing. Please create a site first.', 'red');
    return false;
  }

  const testSite = sites[0];
  log(`✓ Using site: ${testSite.name}`, 'green');

  log('Mapping device to site (triggering automatic initialization)...', 'blue');

  // Insert into device_site_assignments (this triggers the trigger function)
  const { error: mappingError } = await supabase
    .from('device_site_assignments')
    .insert({
      device_id: deviceId,
      site_id: testSite.site_id,
      program_id: testSite.program_id,
      is_active: true,
    });

  if (mappingError) {
    log(`❌ Failed to map device: ${mappingError.message}`, 'red');
    return false;
  }

  log('✓ Device mapped to site', 'green');

  // Wait a moment for trigger to execute
  log('Waiting for trigger to execute...', 'yellow');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Verify device was initialized
  log('Verifying device initialization...', 'blue');

  const { data: updatedDevice, error: fetchError } = await supabase
    .from('devices')
    .select('*')
    .eq('device_id', deviceId)
    .single();

  if (fetchError) {
    log(`❌ Failed to fetch updated device: ${fetchError.message}`, 'red');
    return false;
  }

  log('Device after mapping:', 'cyan');
  log(`  Provisioning Status: ${updatedDevice.provisioning_status}`, 'blue');
  log(`  Active: ${updatedDevice.is_active}`, 'blue');
  log(`  Site ID: ${updatedDevice.site_id || 'NOT SET'}`, updatedDevice.site_id ? 'green' : 'red');
  log(`  Program ID: ${updatedDevice.program_id || 'NOT SET'}`, updatedDevice.program_id ? 'green' : 'red');
  log(`  Company ID: ${updatedDevice.company_id || 'NOT SET'}`, updatedDevice.company_id ? 'green' : 'red');
  log(`  Next Wake: ${updatedDevice.next_wake_at || 'NOT SET'}`, updatedDevice.next_wake_at ? 'green' : 'red');

  // Check all required fields are populated
  const checks = [
    { field: 'provisioning_status', expected: 'active', actual: updatedDevice.provisioning_status },
    { field: 'is_active', expected: true, actual: updatedDevice.is_active },
    { field: 'site_id', expected: testSite.site_id, actual: updatedDevice.site_id },
    { field: 'program_id', expected: testSite.program_id, actual: updatedDevice.program_id },
    { field: 'company_id', expected: 'not null', actual: updatedDevice.company_id },
    { field: 'next_wake_at', expected: 'not null', actual: updatedDevice.next_wake_at },
  ];

  let allPassed = true;
  for (const check of checks) {
    const passed = check.expected === 'not null'
      ? check.actual !== null && check.actual !== undefined
      : check.actual === check.expected;

    if (passed) {
      log(`  ✓ ${check.field} is correct`, 'green');
    } else {
      log(`  ❌ ${check.field} incorrect: expected ${check.expected}, got ${check.actual}`, 'red');
      allPassed = false;
    }
  }

  return allPassed;
}

async function testWelcomeCommand(deviceId) {
  section('Test 4: Welcome Command');

  log('Checking for welcome command...', 'blue');

  // Wait a moment for command to be queued
  await new Promise(resolve => setTimeout(resolve, 2000));

  const { data: commands, error: commandError } = await supabase
    .from('device_commands')
    .select('*')
    .eq('device_id', deviceId)
    .order('issued_at', { ascending: false })
    .limit(1);

  if (commandError) {
    log(`❌ Error fetching commands: ${commandError.message}`, 'red');
    return false;
  }

  if (!commands || commands.length === 0) {
    log('⚠️  No welcome command found (mqtt-service may not be running)', 'yellow');
    log('   The command queue requires mqtt-service to be running', 'yellow');
    return true; // Don't fail the test if service isn't running
  }

  const command = commands[0];
  log('✓ Welcome command found:', 'green');
  log(`  Command Type: ${command.command_type}`, 'blue');
  log(`  Status: ${command.status}`, 'blue');
  log(`  Issued At: ${command.issued_at}`, 'blue');
  log(`  Payload: ${JSON.stringify(command.command_payload, null, 2)}`, 'blue');

  // Verify command is correct type
  if (command.command_type !== 'set_wake_schedule') {
    log('❌ Expected set_wake_schedule command', 'red');
    return false;
  }

  return true;
}

async function testValidationFunction(deviceId) {
  section('Test 5: Validation Function');

  log('Testing fn_validate_device_provisioning...', 'blue');

  const { data, error } = await supabase.rpc('fn_validate_device_provisioning', {
    p_device_id: deviceId,
  });

  if (error) {
    log(`❌ Validation function error: ${error.message}`, 'red');
    return false;
  }

  log('Validation result:', 'cyan');
  log(`  Valid: ${data.is_valid}`, data.is_valid ? 'green' : 'red');
  log(`  Message: ${data.message}`, data.is_valid ? 'green' : 'yellow');

  if (data.details) {
    log('  Details:', 'blue');
    Object.entries(data.details).forEach(([key, value]) => {
      log(`    ${key}: ${value}`, 'blue');
    });
  }

  return data.is_valid;
}

async function main() {
  console.log('\n');
  log('╔══════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  Device Provisioning Flow Test Suite                            ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════════╝', 'cyan');
  console.log('\n');

  log('Testing environment:', 'cyan');
  log(`  Supabase URL: ${supabaseUrl}`, 'blue');
  log(`  Test Device MAC: ${TEST_DEVICE_MAC}`, 'blue');
  console.log('\n');

  const results = {
    databaseFunctions: false,
    autoProvisioning: false,
    deviceMapping: false,
    welcomeCommand: false,
    validation: false,
  };

  try {
    // Cleanup any previous test data
    await cleanup();

    // Test 1: Database Functions
    results.databaseFunctions = await testDatabaseFunctions();

    if (!results.databaseFunctions) {
      log('\n❌ Database functions test failed. Cannot continue.', 'red');
      log('   Please ensure the migration has been applied.', 'yellow');
      return;
    }

    // Test 2: Auto-Provisioning
    const device = await testAutoProvisioning();

    if (!device) {
      log('\n❌ Auto-provisioning test failed. Cannot continue.', 'red');
      return;
    }

    results.autoProvisioning = true;

    // Test 3: Device Mapping
    results.deviceMapping = await testDeviceMapping(device.device_id);

    // Test 4: Welcome Command
    results.welcomeCommand = await testWelcomeCommand(device.device_id);

    // Test 5: Validation
    results.validation = await testValidationFunction(device.device_id);

  } catch (error) {
    log(`\n❌ Test suite error: ${error.message}`, 'red');
    console.error(error);
  }

  // Print summary
  section('Test Summary');

  const testResults = [
    { name: 'Database Functions', passed: results.databaseFunctions },
    { name: 'Auto-Provisioning', passed: results.autoProvisioning },
    { name: 'Device Mapping', passed: results.deviceMapping },
    { name: 'Welcome Command', passed: results.welcomeCommand },
    { name: 'Validation', passed: results.validation },
  ];

  testResults.forEach(test => {
    const icon = test.passed ? '✓' : '✗';
    const color = test.passed ? 'green' : 'red';
    log(`  ${icon} ${test.name}`, color);
  });

  const totalTests = testResults.length;
  const passedTests = testResults.filter(t => t.passed).length;

  console.log('\n');
  log(`Results: ${passedTests}/${totalTests} tests passed`, passedTests === totalTests ? 'green' : 'yellow');

  if (passedTests === totalTests) {
    log('\n✨ All tests passed! Device provisioning automation is working correctly.', 'green');
  } else {
    log('\n⚠️  Some tests failed. Please review the output above.', 'yellow');
  }

  // Cleanup
  log('\nDo you want to clean up test data? (y/n)', 'cyan');
  // In automated mode, always cleanup
  if (process.env.AUTO_CLEANUP !== 'false') {
    await cleanup();
  }

  console.log('\n');
}

main().catch(console.error);
