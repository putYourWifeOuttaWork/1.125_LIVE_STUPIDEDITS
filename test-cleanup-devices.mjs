#!/usr/bin/env node
/**
 * Test Device Cleanup Script
 *
 * Removes all test devices and their associated records from the database.
 * Safe to run between test runs to ensure clean state.
 *
 * Usage:
 *   node test-cleanup-devices.mjs
 *   node test-cleanup-devices.mjs --confirm  (skip confirmation prompt)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TEST_DEVICE_PATTERN = 'TEST-ESP32-%';

async function promptConfirmation() {
  const args = process.argv.slice(2);
  if (args.includes('--confirm')) {
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      '\n⚠️  This will DELETE all test devices and related records. Continue? (yes/no): ',
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes');
      }
    );
  });
}

async function cleanupTestDevices() {
  console.log('🧹 Starting test device cleanup...\n');

  // Get all test devices
  console.log('🔍 Finding test devices...');
  const { data: testDevices, error: findError } = await supabase
    .from('devices')
    .select('device_id, device_mac, device_code, device_name')
    .ilike('device_mac', TEST_DEVICE_PATTERN);

  if (findError) {
    console.error('❌ Failed to find test devices:', findError.message);
    process.exit(1);
  }

  if (!testDevices || testDevices.length === 0) {
    console.log('✅ No test devices found. Database is clean!');
    return;
  }

  console.log(`\n📋 Found ${testDevices.length} test device(s):`);
  for (const device of testDevices) {
    console.log(`   • ${device.device_mac} - ${device.device_code} - ${device.device_name}`);
  }

  // Confirm deletion
  const confirmed = await promptConfirmation();
  if (!confirmed) {
    console.log('\n❌ Cleanup cancelled by user');
    process.exit(0);
  }

  console.log('\n🗑️  Deleting test devices and related records...\n');

  let deletedCount = 0;
  const deviceIds = testDevices.map((d) => d.device_id);

  // Delete related records (CASCADE will handle most, but we'll be explicit for clarity)
  console.log('   Deleting device wake sessions...');
  const { error: sessionsError } = await supabase
    .from('device_wake_sessions')
    .delete()
    .in('device_id', deviceIds);
  if (sessionsError) console.warn(`   ⚠️  Sessions: ${sessionsError.message}`);

  console.log('   Deleting device history...');
  const { error: historyError } = await supabase
    .from('device_history')
    .delete()
    .in('device_id', deviceIds);
  if (historyError) console.warn(`   ⚠️  History: ${historyError.message}`);

  console.log('   Deleting device images...');
  const { error: imagesError } = await supabase
    .from('device_images')
    .delete()
    .in('device_id', deviceIds);
  if (imagesError) console.warn(`   ⚠️  Images: ${imagesError.message}`);

  console.log('   Deleting device telemetry...');
  const { error: telemetryError } = await supabase
    .from('device_telemetry')
    .delete()
    .in('device_id', deviceIds);
  if (telemetryError) console.warn(`   ⚠️  Telemetry: ${telemetryError.message}`);

  console.log('   Deleting device commands...');
  const { error: commandsError } = await supabase
    .from('device_commands')
    .delete()
    .in('device_id', deviceIds);
  if (commandsError) console.warn(`   ⚠️  Commands: ${commandsError.message}`);

  console.log('   Deleting device assignments...');
  const { error: siteAssignError } = await supabase
    .from('device_site_assignments')
    .delete()
    .in('device_id', deviceIds);
  if (siteAssignError) console.warn(`   ⚠️  Site assignments: ${siteAssignError.message}`);

  const { error: programAssignError } = await supabase
    .from('device_program_assignments')
    .delete()
    .in('device_id', deviceIds);
  if (programAssignError) console.warn(`   ⚠️  Program assignments: ${programAssignError.message}`);

  // Finally, delete the devices themselves
  console.log('   Deleting devices...');
  for (const device of testDevices) {
    const { error: deleteError } = await supabase
      .from('devices')
      .delete()
      .eq('device_id', device.device_id);

    if (deleteError) {
      console.error(`   ❌ Failed to delete ${device.device_mac}: ${deleteError.message}`);
    } else {
      console.log(`   ✅ Deleted ${device.device_mac}`);
      deletedCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test device cleanup complete!');
  console.log('='.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   • Deleted ${deletedCount} test device(s)`);
  console.log(`   • Removed all related records (sessions, history, images, telemetry)`);
  console.log(`\n✨ Database is now clean and ready for fresh testing!\n`);
}

// Run the cleanup
cleanupTestDevices().catch((error) => {
  console.error('\n❌ Cleanup failed:', error);
  process.exit(1);
});
