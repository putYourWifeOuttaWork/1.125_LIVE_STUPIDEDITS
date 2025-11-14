#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testDeviceTypes() {
  console.log('\n=== Testing Device Type Migration ===\n');

  // Check all devices and their types
  const { data: devices, error } = await supabase
    .from('devices')
    .select('device_id, device_mac, device_name, device_type, provisioning_status, site_id, company_id')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching devices:', error);
    return;
  }

  console.log(`Total devices: ${devices.length}\n`);

  // Categorize devices
  const physical = devices.filter(d => d.device_type === 'physical' || d.device_type === null);
  const virtual = devices.filter(d => d.device_type === 'virtual');
  const unmapped = physical.filter(d => d.site_id === null);
  const mapped = physical.filter(d => d.site_id !== null);

  console.log('📊 Device Breakdown:');
  console.log(`  Physical Devices: ${physical.length}`);
  console.log(`  Virtual Devices: ${virtual.length}`);
  console.log(`  Unmapped Physical: ${unmapped.length}`);
  console.log(`  Mapped Physical: ${mapped.length}\n`);

  // Show virtual devices
  if (virtual.length > 0) {
    console.log('🤖 Virtual Devices:');
    virtual.forEach(d => {
      console.log(`  - ${d.device_name || d.device_mac}`);
      console.log(`    Status: ${d.provisioning_status}`);
      console.log(`    Company: ${d.company_id || 'NULL (system-wide)'}\n`);
    });
  }

  // Show unmapped physical devices
  if (unmapped.length > 0) {
    console.log('🔓 Unmapped Physical Devices (Super Admin Only):');
    unmapped.forEach(d => {
      console.log(`  - ${d.device_name || d.device_mac}`);
      console.log(`    Type: ${d.device_type || 'NULL (treated as physical)'}`);
      console.log(`    Status: ${d.provisioning_status}\n`);
    });
  }

  // Show mapped physical devices
  if (mapped.length > 0) {
    console.log('✅ Mapped Physical Devices:');
    mapped.slice(0, 5).forEach(d => {
      console.log(`  - ${d.device_name || d.device_mac}`);
      console.log(`    Type: ${d.device_type || 'NULL (treated as physical)'}`);
      console.log(`    Status: ${d.provisioning_status}`);
      console.log(`    Company: ${d.company_id || 'NULL'}\n`);
    });
    if (mapped.length > 5) {
      console.log(`  ... and ${mapped.length - 5} more\n`);
    }
  }

  // Verify constraints
  console.log('🔍 Verification:');
  console.log(`  ✓ Virtual devices have provisioning_status = 'system': ${virtual.every(d => d.provisioning_status === 'system')}`);
  console.log(`  ✓ Virtual devices have company_id = NULL: ${virtual.every(d => d.company_id === null)}`);
  console.log(`  ✓ Physical devices are visible: ${physical.length > 0}`);
}

testDeviceTypes()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
