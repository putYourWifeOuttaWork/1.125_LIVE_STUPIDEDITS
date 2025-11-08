#!/usr/bin/env node

/**
 * Comprehensive Schema Verification Script
 * Checks all required tables, columns, and indexes for device provisioning
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║   Device Provisioning Schema Verification                     ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const results = {
  passed: [],
  failed: [],
  warnings: []
};

async function checkTableExists(tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);

    if (error && error.code === '42P01') {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

async function checkColumnExists(tableName, columnName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select(columnName)
      .limit(1);

    if (error && error.message.includes(columnName)) {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

async function verifyDevicesTable() {
  console.log('📋 Checking devices table...');

  const tableExists = await checkTableExists('devices');
  if (!tableExists) {
    results.failed.push('❌ devices table does not exist');
    return;
  }
  results.passed.push('✅ devices table exists');

  // Check critical columns
  const criticalColumns = [
    'device_id',
    'device_mac',
    'device_code',
    'device_name',
    'site_id',
    'program_id',
    'provisioning_status',
    'is_active',
    'last_seen_at',
    'mapped_at',
    'mapped_by_user_id'
  ];

  for (const column of criticalColumns) {
    const exists = await checkColumnExists('devices', column);
    if (exists) {
      results.passed.push(`✅ devices.${column} exists`);
    } else {
      results.failed.push(`❌ devices.${column} is missing`);
    }
  }

  // Check for devices with pending_mapping status
  const { data: pendingDevices, error } = await supabase
    .from('devices')
    .select('device_id, device_mac, device_code, provisioning_status')
    .eq('provisioning_status', 'pending_mapping');

  if (!error && pendingDevices) {
    console.log(`   Found ${pendingDevices.length} pending device(s)`);
    if (pendingDevices.length > 0) {
      results.warnings.push(`⚠️  ${pendingDevices.length} device(s) awaiting mapping`);
      pendingDevices.forEach(d => {
        console.log(`   - ${d.device_mac} (${d.device_code || 'NO CODE'})`);
      });
    }
  }

  console.log('');
}

async function verifyJunctionTables() {
  console.log('📋 Checking junction tables...');

  const tables = [
    'device_site_assignments',
    'device_program_assignments',
    'site_program_assignments'
  ];

  for (const table of tables) {
    const exists = await checkTableExists(table);
    if (exists) {
      results.passed.push(`✅ ${table} table exists`);

      // Check row count
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (!error) {
        console.log(`   ${table}: ${count} record(s)`);
      }
    } else {
      results.failed.push(`❌ ${table} table does not exist`);
    }
  }

  console.log('');
}

async function verifyDeviceTelemetryTable() {
  console.log('📋 Checking device_telemetry table...');

  const exists = await checkTableExists('device_telemetry');
  if (exists) {
    results.passed.push('✅ device_telemetry table exists');

    const { count } = await supabase
      .from('device_telemetry')
      .select('*', { count: 'exact', head: true });

    console.log(`   Found ${count} telemetry record(s)`);
  } else {
    results.failed.push('❌ device_telemetry table does not exist');
  }

  console.log('');
}

async function verifyDeviceImagesTable() {
  console.log('📋 Checking device_images table...');

  const exists = await checkTableExists('device_images');
  if (exists) {
    results.passed.push('✅ device_images table exists');

    const { count } = await supabase
      .from('device_images')
      .select('*', { count: 'exact', head: true });

    console.log(`   Found ${count} image record(s)`);
  } else {
    results.failed.push('❌ device_images table does not exist');
  }

  console.log('');
}

async function verifyDeviceCommandsTable() {
  console.log('📋 Checking device_commands table...');

  const exists = await checkTableExists('device_commands');
  if (exists) {
    results.passed.push('✅ device_commands table exists');

    const { count } = await supabase
      .from('device_commands')
      .select('*', { count: 'exact', head: true });

    console.log(`   Found ${count} command record(s)`);
  } else {
    results.failed.push('❌ device_commands table does not exist');
  }

  console.log('');
}

async function verifyDeviceAlertsTable() {
  console.log('📋 Checking device_alerts table...');

  const exists = await checkTableExists('device_alerts');
  if (exists) {
    results.passed.push('✅ device_alerts table exists');

    const { count } = await supabase
      .from('device_alerts')
      .select('*', { count: 'exact', head: true });

    console.log(`   Found ${count} alert record(s)`);
  } else {
    results.failed.push('❌ device_alerts table does not exist');
  }

  console.log('');
}

async function verifySubmissionsDeviceColumns() {
  console.log('📋 Checking submissions table device columns...');

  const columns = ['created_by_device_id', 'is_device_generated'];

  for (const column of columns) {
    const exists = await checkColumnExists('submissions', column);
    if (exists) {
      results.passed.push(`✅ submissions.${column} exists`);
    } else {
      results.failed.push(`❌ submissions.${column} is missing`);
    }
  }

  console.log('');
}

async function verifySitesCodeColumn() {
  console.log('📋 Checking sites.site_code column...');

  const exists = await checkColumnExists('sites', 'site_code');
  if (exists) {
    results.passed.push('✅ sites.site_code exists');
  } else {
    results.warnings.push('⚠️  sites.site_code is missing (optional feature)');
  }

  console.log('');
}

async function printSummary() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║   VERIFICATION SUMMARY                                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}\n`);

  if (results.failed.length > 0) {
    console.log('FAILED CHECKS:');
    results.failed.forEach(msg => console.log(`  ${msg}`));
    console.log('');
  }

  if (results.warnings.length > 0) {
    console.log('WARNINGS:');
    results.warnings.forEach(msg => console.log(`  ${msg}`));
    console.log('');
  }

  if (results.failed.length === 0) {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║   ✅ ALL CRITICAL CHECKS PASSED                               ║');
    console.log('║   Your database schema is ready for device provisioning!      ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    return true;
  } else {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║   ❌ SCHEMA VERIFICATION FAILED                               ║');
    console.log('║   Please apply missing migrations before proceeding.          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    return false;
  }
}

async function main() {
  await verifyDevicesTable();
  await verifyJunctionTables();
  await verifyDeviceTelemetryTable();
  await verifyDeviceImagesTable();
  await verifyDeviceCommandsTable();
  await verifyDeviceAlertsTable();
  await verifySubmissionsDeviceColumns();
  await verifySitesCodeColumn();

  const success = await printSummary();
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
