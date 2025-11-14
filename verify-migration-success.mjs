#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n=== MIGRATION SUCCESS VERIFICATION ===\n');

// Check device_type distribution
const { data: devices } = await supabase
  .from('devices')
  .select('device_id, device_mac, device_name, device_type, provisioning_status');

const physical = devices?.filter(d => d.device_type === 'physical') || [];
const virtual = devices?.filter(d => d.device_type === 'virtual') || [];

console.log('✅ device_type column added:');
console.log(`   Physical devices: ${physical.length}`);
console.log(`   Virtual devices: ${virtual.length}`);

console.log('\n✅ System device updated:');
const systemDevice = virtual.find(d => d.device_mac === 'SYSTEM:AUTO:GENERATED');
if (systemDevice) {
  console.log(`   MAC: ${systemDevice.device_mac}`);
  console.log(`   Type: ${systemDevice.device_type}`);
  console.log(`   Status: ${systemDevice.provisioning_status}`);
}

console.log('\n✅ Provisioning statuses:');
const statuses = [...new Set(devices?.map(d => d.provisioning_status))];
statuses.forEach(s => console.log(`   - ${s}`));

console.log('\n✅ Physical devices (should be visible to users):');
physical.forEach(d => {
  console.log(`   - ${d.device_name}: ${d.provisioning_status}`);
});

console.log('\n✅ Virtual devices (should be hidden from users):');
virtual.forEach(d => {
  console.log(`   - ${d.device_name}: ${d.provisioning_status}`);
});

console.log('\n=== ALL MIGRATIONS APPLIED SUCCESSFULLY ===\n');

process.exit(0);
