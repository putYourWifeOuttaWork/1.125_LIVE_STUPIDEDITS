import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Analyzing SITE_SNAPSHOTS table...\n');

// Check if site_snapshots exists
const { data: snapshots, error: snapshotError } = await supabase
  .from('site_snapshots')
  .select('*')
  .limit(2);

if (snapshotError) {
  console.log('❌ site_snapshots error:', snapshotError.message);
} else {
  console.log('📸 site_snapshots sample:');
  console.log(JSON.stringify(snapshots, null, 2));
}

// Check site_device_sessions structure
const { data: sessions, error: sessionError } = await supabase
  .from('site_device_sessions')
  .select('*')
  .limit(1);

console.log('\n\n📅 site_device_sessions structure:');
console.log(JSON.stringify(sessions, null, 2));

// Check device_telemetry to understand wake data
const { data: telemetry, error: telemetryError } = await supabase
  .from('device_telemetry')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(2);

console.log('\n\n📡 device_telemetry sample (wake data):');
console.log(JSON.stringify(telemetry, null, 2));

// Check device_images
const { data: images, error: imagesError } = await supabase
  .from('device_images')
  .select('*')
  .order('captured_at', { ascending: false })
  .limit(2);

console.log('\n\n📷 device_images sample:');
console.log(JSON.stringify(images, null, 2));

// Check zones in sites
const { data: siteWithZones, error: zoneError } = await supabase
  .from('sites')
  .select('site_id, name, zones, wall_details')
  .not('zones', 'is', null)
  .limit(1);

console.log('\n\n🗺️  Sites with zones:');
console.log(JSON.stringify(siteWithZones, null, 2));

