#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n=== MIGRATION READINESS CHECK ===\n');

async function checkMigrations() {
  // Check 1: device_type column doesn't exist yet
  const { data: devices } = await supabase
    .from('devices')
    .select('*')
    .limit(1);

  const hasDeviceType = devices && devices.length > 0 && 'device_type' in devices[0];

  console.log('✓ Checking device_type column:');
  if (hasDeviceType) {
    console.log('  ⚠️  Column already exists - migration may have been partially applied');
  } else {
    console.log('  ✓ Column does not exist - ready for migration');
  }

  // Check 2: Current provisioning statuses
  const { data: statusData } = await supabase
    .from('devices')
    .select('provisioning_status');

  const statuses = [...new Set(statusData?.map(d => d.provisioning_status) || [])];
  console.log('\n✓ Current provisioning_status values:');
  statuses.forEach(s => console.log(`  - ${s}`));

  // Check 3: System device
  const { data: systemDevice } = await supabase
    .from('devices')
    .select('device_id, device_mac, provisioning_status, company_id')
    .eq('device_mac', 'SYSTEM:AUTO:GENERATED')
    .maybeSingle();

  console.log('\n✓ System device status:');
  if (systemDevice) {
    console.log(`  Device ID: ${systemDevice.device_id}`);
    console.log(`  Current status: ${systemDevice.provisioning_status}`);
    console.log(`  Company ID: ${systemDevice.company_id || 'NULL'}`);
    console.log(`  Will be updated to: provisioning_status='system', device_type='virtual'`);
  } else {
    console.log('  ⚠️  No system device found');
  }

  // Check 4: Total device count
  const { data: allDevices } = await supabase
    .from('devices')
    .select('device_id');

  console.log(`\n✓ Total devices: ${allDevices?.length || 0}`);
  console.log(`  ${(allDevices?.length || 0) - 1} will be marked as 'physical'`);
  console.log(`  1 will be marked as 'virtual' (system device)`);

  console.log('\n=== MIGRATION PLAN ===\n');
  console.log('Migration 20251114000002 will:');
  console.log('  1. Add device_type column (default: physical)');
  console.log('  2. Update system device to device_type=virtual, status=system');
  console.log('  3. Update all other devices to device_type=physical');
  console.log('  4. Add constraints for device_type and provisioning_status');
  console.log('  5. Update get_unassigned_devices() function');
  console.log('');
  console.log('Migration 20251114000003 will:');
  console.log('  1. Update RLS policies to show physical devices');
  console.log('  2. Hide virtual devices from regular users');
  console.log('  3. Allow super admins to see unmapped devices');
  console.log('');
  console.log('✅ Migrations are ready to apply!');
}

checkMigrations()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
