import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking devices...\n');

// Check for esp32cam-31
const { data: device31, error: err31 } = await supabase
  .from('devices')
  .select('*')
  .or(`device_mac.eq.A3:67:B2:11:22:33,device_mac.eq.esp32cam-31,mqtt_client_id.eq.esp32cam-31`)
  .maybeSingle();

console.log('Device esp32cam-31 or A3:67:B2:11:22:33:', device31 ? 'FOUND' : 'NOT FOUND');
if (device31) {
  console.log(JSON.stringify(device31, null, 2));
}

// Check all recent devices
console.log('\n📋 All devices (last 10):');
const { data: allDevices, error } = await supabase
  .from('devices')
  .select('device_id, device_mac, device_name, provisioning_status, last_seen_at, created_at')
  .order('created_at', { ascending: false })
  .limit(10);

if (allDevices) {
  allDevices.forEach((d, i) => {
    console.log(`${i+1}. ${d.device_mac} - ${d.device_name || 'unnamed'} (${d.provisioning_status}) - Created: ${d.created_at}`);
  });
}

process.exit(0);
