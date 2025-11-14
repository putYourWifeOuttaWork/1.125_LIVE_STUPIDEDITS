#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n=== FIXING SYSTEM DEVICE TYPE ===\n');

const { data: before } = await supabase
  .from('devices')
  .select('*')
  .eq('device_mac', 'SYSTEM:AUTO:GENERATED')
  .single();

console.log('Before update:');
console.log('  device_type:', before?.device_type);
console.log('  provisioning_status:', before?.provisioning_status);

// Update the device
const { data: updated, error } = await supabase
  .from('devices')
  .update({ device_type: 'virtual' })
  .eq('device_mac', 'SYSTEM:AUTO:GENERATED')
  .select()
  .single();

if (error) {
  console.error('Error updating device:', error);
  process.exit(1);
}

console.log('\nAfter update:');
console.log('  device_type:', updated?.device_type);
console.log('  provisioning_status:', updated?.provisioning_status);

console.log('\n✅ System device type updated successfully!\n');

process.exit(0);
