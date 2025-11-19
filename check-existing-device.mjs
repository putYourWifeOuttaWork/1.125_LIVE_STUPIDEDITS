import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking for device with MAC: B8F862F9CFB8\n');

// Check if device exists
const { data: device, error } = await supabase
  .from('devices')
  .select('*')
  .eq('device_mac', 'B8F862F9CFB8')
  .maybeSingle();

if (error) {
  console.error('❌ Error:', error);
} else if (device) {
  console.log('✅ Device found:');
  console.log(JSON.stringify(device, null, 2));
} else {
  console.log('❌ Device NOT found in database');
}

console.log('\n🔍 Checking all devices with DEVICE-ESP32S3 codes:\n');

const { data: devices, error: err2 } = await supabase
  .from('devices')
  .select('device_id, device_code, device_mac, provisioning_status')
  .like('device_code', 'DEVICE-ESP32S3%')
  .order('device_code');

if (err2) {
  console.error('❌ Error:', err2);
} else {
  console.log(`Found ${devices.length} devices:`);
  devices.forEach(d => {
    console.log(`  ${d.device_code} | MAC: ${d.device_mac} | Status: ${d.provisioning_status}`);
  });
}

console.log('\n🔍 Checking device_code sequence/counter:\n');

// Check what the next device_code should be
const { data: lastDevice, error: err3 } = await supabase
  .from('devices')
  .select('device_code')
  .like('device_code', 'DEVICE-ESP32S3%')
  .order('device_code', { ascending: false })
  .limit(1)
  .maybeSingle();

if (err3) {
  console.error('❌ Error:', err3);
} else if (lastDevice) {
  console.log(`Last device_code: ${lastDevice.device_code}`);
  const match = lastDevice.device_code.match(/DEVICE-ESP32S3-(\d+)/);
  if (match) {
    const lastNum = parseInt(match[1], 10);
    console.log(`Next device_code should be: DEVICE-ESP32S3-${String(lastNum + 1).padStart(3, '0')}`);
  }
} else {
  console.log('No ESP32S3 devices found - next should be DEVICE-ESP32S3-001');
}
