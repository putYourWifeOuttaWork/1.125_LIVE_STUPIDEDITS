import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

console.log('🔍 Checking MQTT device handler setup...\n');

// Check if edge function exists
console.log('1️⃣ Checking edge function deployment...');
try {
  const response = await fetch(
    `${process.env.VITE_SUPABASE_URL}/functions/v1/mqtt_device_handler`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test: 'ping' })
    }
  );
  
  console.log('   Status:', response.status);
  const text = await response.text();
  console.log('   Response:', text.substring(0, 500));
} catch (err) {
  console.error('   ❌ Error:', err.message);
}

// Check if any devices exist with this MAC
console.log('\n2️⃣ Checking for device with MAC A3:67:B2:11:22:33...');
const { data: devices, error: devError } = await supabase
  .from('devices')
  .select('device_id, device_mac, device_name, provisioning_status, last_seen_at')
  .eq('device_mac', 'A3:67:B2:11:22:33');

if (devError) {
  console.error('   ❌ Error:', devError.message);
} else {
  console.log('   Found devices:', devices.length);
  if (devices.length > 0) {
    console.log('   Devices:', JSON.stringify(devices, null, 2));
  } else {
    console.log('   ✓ No existing device found - should auto-provision');
  }
}

// Check recent device activity
console.log('\n3️⃣ Checking recent device activity (last 5 minutes)...');
const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const { data: recentDevices, error: recentError } = await supabase
  .from('devices')
  .select('device_id, device_mac, device_name, last_seen_at, created_at')
  .gte('created_at', fiveMinAgo)
  .order('created_at', { ascending: false });

if (recentError) {
  console.error('   ❌ Error:', recentError.message);
} else {
  console.log('   Recent devices:', recentDevices.length);
  if (recentDevices.length > 0) {
    console.log('   Devices:', JSON.stringify(recentDevices, null, 2));
  }
}

console.log('\n✅ Check complete');
process.exit(0);
