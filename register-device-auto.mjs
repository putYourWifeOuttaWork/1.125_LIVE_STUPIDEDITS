import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jycxolmevsvrxmeinxff.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzE0MzYsImV4cCI6MjA2NjcwNzQzNn0.0msVw5lkmycrU1p1qFiUTv7Q6AB-IIdpZejYbekW4sk';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('\n=== REGISTERING IOT DEVICE ===\n');

// Find the site
const { data: sites, error: siteError } = await supabase
  .from('sites')
  .select('site_id, name, program_id')
  .eq('name', 'Test Site for IoT Device')
  .maybeSingle();

if (siteError || !sites) {
  console.log('❌ Error finding site:', siteError?.message || 'Site not found');
  process.exit(1);
}

console.log('✓ Found site:', sites.name);
console.log('  Site ID:', sites.site_id);

// Generate test device data
const deviceMac = 'AA:BB:CC:DD:EE:' + Math.floor(Math.random() * 100).toString().padStart(2, '0');
const deviceName = 'ESP32-CAM-001';

console.log('\n✓ Creating device...');
console.log('  MAC Address:', deviceMac);
console.log('  Device Name:', deviceName);

const deviceData = {
  device_mac: deviceMac,
  device_name: deviceName,
  site_id: sites.site_id,
  program_id: sites.program_id,
  hardware_version: 'ESP32-S3',
  is_active: true,
  last_seen_at: new Date().toISOString(),
  provisioned_at: new Date().toISOString()
};

const result = await supabase
  .from('devices')
  .insert(deviceData)
  .select();

if (result.error) {
  console.log('\n❌ Error creating device:', result.error.message);
  console.log('Details:', result.error);
  process.exit(1);
}

const device = result.data[0];

console.log('\n🎉 DEVICE REGISTERED SUCCESSFULLY!\n');
console.log('═══════════════════════════════════════');
console.log('Device ID:      ', device.device_id);
console.log('Device MAC:     ', device.device_mac);
console.log('Device Name:    ', device.device_name);
console.log('Site ID:        ', device.site_id);
console.log('Active:         ', device.is_active);
console.log('═══════════════════════════════════════\n');

console.log('✓ Your IoT device is now ready to send data!\n');
console.log('IMPORTANT: Save this MAC address for testing:');
console.log('  → ' + device.device_mac);
console.log('\nNext step: I will show you how to test it!\n');
