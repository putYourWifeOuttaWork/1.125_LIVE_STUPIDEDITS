#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n=== SYSTEM DEVICE CHECK ===\n');

const { data: systemDevice } = await supabase
  .from('devices')
  .select('*')
  .eq('device_mac', 'SYSTEM:AUTO:GENERATED')
  .single();

if (systemDevice) {
  console.log('System Device Found:');
  console.log('  device_id:', systemDevice.device_id);
  console.log('  device_mac:', systemDevice.device_mac);
  console.log('  device_name:', systemDevice.device_name);
  console.log('  device_type:', systemDevice.device_type);
  console.log('  provisioning_status:', systemDevice.provisioning_status);
  console.log('  company_id:', systemDevice.company_id);
  console.log('  program_id:', systemDevice.program_id);
  console.log('  site_id:', systemDevice.site_id);
} else {
  console.log('No system device found');
}

// Check all unmapped devices
console.log('\n=== UNMAPPED DEVICES (company_id IS NULL) ===\n');

const { data: unmapped } = await supabase
  .from('devices')
  .select('device_id, device_mac, device_name, device_type, provisioning_status, company_id')
  .is('company_id', null);

if (unmapped && unmapped.length > 0) {
  console.log(`Found ${unmapped.length} unmapped devices:`);
  unmapped.forEach(d => {
    console.log(`  - ${d.device_name || d.device_mac}`);
    console.log(`    MAC: ${d.device_mac}`);
    console.log(`    Type: ${d.device_type}`);
    console.log(`    Status: ${d.provisioning_status}`);
    console.log(`    Company: ${d.company_id}`);
    console.log('');
  });
} else {
  console.log('No unmapped devices found');
}

process.exit(0);
