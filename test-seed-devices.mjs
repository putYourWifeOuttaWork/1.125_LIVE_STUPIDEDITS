#!/usr/bin/env node
/**
 * Test Device Seed Script
 *
 * Creates mock test devices with different provisioning states for comprehensive testing.
 * These fixtures enable E2E testing without physical hardware.
 *
 * Usage:
 *   node test-seed-devices.mjs
 *
 * Creates 3 test devices:
 *   1. TEST-ESP32-001 - Fully mapped device (for happy path testing)
 *   2. TEST-ESP32-002 - Fully mapped device (for retry testing)
 *   3. TEST-ESP32-003 - Fully mapped device (for offline recovery testing)
 */

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

// Test device configurations
const TEST_DEVICES = [
  {
    device_mac: 'TEST-ESP32-001',
    device_code: 'TEST-DEVICE-001',
    device_name: 'Test Device 001 - Happy Path',
    hardware_version: 'ESP32-S3',
    firmware_version: '1.0.0',
    provisioning_status: 'active',
    is_active: true,
    battery_voltage: 4.2,
    battery_health_percent: 95,
    notes: 'Test device for happy path scenarios (no retries, successful completion)',
  },
  {
    device_mac: 'TEST-ESP32-002',
    device_code: 'TEST-DEVICE-002',
    device_name: 'Test Device 002 - Missing Chunks',
    hardware_version: 'ESP32-S3',
    firmware_version: '1.0.0',
    provisioning_status: 'active',
    is_active: true,
    battery_voltage: 3.9,
    battery_health_percent: 80,
    notes: 'Test device for chunk retry scenarios (simulates missing chunks)',
  },
  {
    device_mac: 'TEST-ESP32-003',
    device_code: 'TEST-DEVICE-003',
    device_name: 'Test Device 003 - Offline Recovery',
    hardware_version: 'ESP32-S3',
    firmware_version: '1.0.0',
    provisioning_status: 'active',
    is_active: true,
    battery_voltage: 3.7,
    battery_health_percent: 70,
    notes: 'Test device for offline recovery scenarios (pending image queue)',
  },
];

async function findTestSiteAndProgram() {
  console.log('\n🔍 Finding test site and program...');

  // Try to find any active site with a program
  const { data: sites, error: siteError } = await supabase
    .from('sites')
    .select('site_id, name, program_id, pilot_programs(program_id, name)')
    .not('program_id', 'is', null)
    .limit(1);

  if (siteError || !sites || sites.length === 0) {
    console.log('⚠️  No existing sites with programs found');
    console.log('📝 You will need to manually assign test devices to a site/program in the UI');
    return { site_id: null, program_id: null };
  }

  const site = sites[0];
  console.log(`✅ Found test site: ${site.name} (${site.site_id})`);
  console.log(`✅ Found test program: ${site.pilot_programs?.name} (${site.program_id})`);

  return {
    site_id: site.site_id,
    program_id: site.program_id,
  };
}

async function seedTestDevices() {
  console.log('🌱 Starting test device seed...\n');

  // Find a test site and program to assign devices to
  const { site_id, program_id } = await findTestSiteAndProgram();

  console.log('\n📦 Creating test devices...');

  const createdDevices = [];

  for (const deviceConfig of TEST_DEVICES) {
    console.log(`\n➡️  Creating ${deviceConfig.device_mac}...`);

    // Check if device already exists
    const { data: existingDevice } = await supabase
      .from('devices')
      .select('device_id, device_mac')
      .eq('device_mac', deviceConfig.device_mac)
      .maybeSingle();

    if (existingDevice) {
      console.log(`   ⚠️  Device ${deviceConfig.device_mac} already exists, skipping...`);
      createdDevices.push(existingDevice);
      continue;
    }

    // Create the device
    const { data: newDevice, error: deviceError } = await supabase
      .from('devices')
      .insert({
        ...deviceConfig,
        site_id: site_id,
        program_id: program_id,
        provisioned_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (deviceError) {
      console.error(`   ❌ Failed to create device: ${deviceError.message}`);
      continue;
    }

    console.log(`   ✅ Created device: ${newDevice.device_code} (${newDevice.device_id})`);
    createdDevices.push(newDevice);

    // Create device assignment records if site and program are available
    if (site_id && program_id) {
      // Create device-site assignment
      await supabase.from('device_site_assignments').insert({
        device_id: newDevice.device_id,
        site_id: site_id,
        program_id: program_id,
        is_primary: true,
        is_active: true,
        assigned_at: new Date().toISOString(),
        reason: 'Test fixture assignment',
      });

      // Create device-program assignment
      await supabase.from('device_program_assignments').insert({
        device_id: newDevice.device_id,
        program_id: program_id,
        is_primary: true,
        is_active: true,
        assigned_at: new Date().toISOString(),
        reason: 'Test fixture assignment',
      });

      console.log(`   ✅ Created assignment records`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test device seed complete!');
  console.log('='.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   • Created ${createdDevices.length} test devices`);
  if (site_id && program_id) {
    console.log(`   • Assigned to site: ${site_id}`);
    console.log(`   • Assigned to program: ${program_id}`);
    console.log(`\n🎯 Devices are ready for testing!`);
  } else {
    console.log(`\n⚠️  Devices created but NOT mapped to site/program`);
    console.log(`   Please assign them manually in the UI or update the seed script`);
  }

  console.log(`\n📋 Test Devices:`);
  for (const device of createdDevices) {
    console.log(`   • ${device.device_mac} - ${device.device_code}`);
  }

  console.log(`\n🚀 Next Steps:`);
  console.log(`   1. Verify devices appear in UI: /devices`);
  console.log(`   2. Run test scenarios: node test-device-scenarios.mjs`);
  console.log(`   3. Validate results: node validate-test-results.mjs`);
  console.log(`   4. Clean up: node test-cleanup-devices.mjs\n`);
}

// Run the seed
seedTestDevices().catch((error) => {
  console.error('\n❌ Seed failed:', error);
  process.exit(1);
});
