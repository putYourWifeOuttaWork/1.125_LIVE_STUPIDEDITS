import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking device positioning data...\n');

// Check device_site_mapping table
const { data: mappings, error: mappingError } = await supabase
  .from('device_site_mapping')
  .select('*')
  .limit(3);

if (mappingError) {
  console.error('❌ Error fetching mappings:', mappingError);
} else {
  console.log('📍 device_site_mapping sample:');
  console.log(JSON.stringify(mappings, null, 2));
}

// Check devices table for position data
const { data: devices, error: deviceError } = await supabase
  .from('devices')
  .select('*')
  .limit(2);

if (deviceError) {
  console.error('❌ Error fetching devices:', deviceError);
} else {
  console.log('\n\n📦 devices table sample:');
  console.log(JSON.stringify(devices, null, 2));
}

// Check site_device_sessions table structure
const { data: sessions, error: sessionError } = await supabase
  .from('site_device_sessions')
  .select('*')
  .limit(2);

if (sessionError) {
  console.error('❌ Error fetching sessions:', sessionError);
} else {
  console.log('\n\n📅 site_device_sessions sample:');
  console.log(JSON.stringify(sessions, null, 2));
}

console.log('\n\n💡 Analysis:');
console.log('===========');
console.log('We need to determine:');
console.log('1. Where device X,Y positions are stored (or if we need to add them)');
console.log('2. How sessions capture snapshots of device states');
console.log('3. What metrics are aggregated per session');

