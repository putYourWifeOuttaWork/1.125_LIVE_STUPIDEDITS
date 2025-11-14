#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n=== CHECKING DEVICES TABLE ===\n');

// Get sample device to see actual columns
const { data: devices, error } = await supabase
  .from('devices')
  .select('*')
  .limit(1);

if (error) {
  console.error('Error:', error);
} else if (devices && devices.length > 0) {
  console.log('Columns in devices table:');
  Object.keys(devices[0]).sort().forEach(col => {
    const value = devices[0][col];
    const type = value === null ? 'null' : typeof value;
    console.log(`  - ${col}: ${type}`);
  });
}

// Check all provisioning_status values
const { data: statuses } = await supabase
  .from('devices')
  .select('provisioning_status, device_mac, device_name')
  .not('provisioning_status', 'is', null);

console.log('\n=== CURRENT PROVISIONING STATUSES ===\n');
const uniqueStatuses = [...new Set(statuses?.map(d => d.provisioning_status) || [])];
console.log('Unique values:', uniqueStatuses);

statuses?.forEach(d => {
  console.log(`  ${d.device_name || d.device_mac}: ${d.provisioning_status}`);
});

// Check for system device
const { data: systemDevice } = await supabase
  .from('devices')
  .select('*')
  .eq('device_mac', 'SYSTEM:AUTO:GENERATED')
  .maybeSingle();

console.log('\n=== SYSTEM DEVICE ===\n');
if (systemDevice) {
  console.log('Found system device:');
  console.log(`  ID: ${systemDevice.device_id}`);
  console.log(`  MAC: ${systemDevice.device_mac}`);
  console.log(`  Status: ${systemDevice.provisioning_status}`);
  console.log(`  Hardware: ${systemDevice.hardware_version}`);
  console.log(`  Company ID: ${systemDevice.company_id}`);
} else {
  console.log('No system device found');
}

// Check constraints
console.log('\n=== CHECKING CONSTRAINTS ===\n');
const { data: allDevices } = await supabase
  .from('devices')
  .select('device_id, device_mac, provisioning_status');

console.log(`Total devices: ${allDevices?.length || 0}`);

process.exit(0);
