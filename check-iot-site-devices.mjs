import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking IoT Test Site 2 devices...\n');

const { data: site } = await supabase
  .from('sites')
  .select('*')
  .ilike('name', '%iot test site 2%')
  .maybeSingle();

if (!site) {
  console.log('❌ IoT Test Site 2 not found');
  process.exit(1);
}

console.log('✅ Found site:', site.name, site.site_id);

const { data: devices, error } = await supabase
  .from('devices')
  .select('device_id, device_code, device_name, x_position, y_position, latest_mgi_score, latest_mgi_velocity, battery_health_percent')
  .eq('site_id', site.site_id)
  .order('device_code');

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

console.log('\n📊 Devices found:', devices.length);

devices.forEach(d => {
  const mgi = d.latest_mgi_score === null ? 'NULL' : d.latest_mgi_score;
  const vel = d.latest_mgi_velocity === null ? 'NULL' : d.latest_mgi_velocity;
  console.log(`\n${d.device_code}`);
  console.log(`  Position: (${d.x_position}, ${d.y_position})`);
  console.log(`  Battery: ${d.battery_health_percent}%`);
  console.log(`  MGI: ${mgi}`);
  console.log(`  Velocity: ${vel}`);
});

console.log('\n🖼️  Checking device_images...');
const { data: images } = await supabase
  .from('device_images')
  .select('device_id, mgi_score, mgi_velocity')
  .in('device_id', devices.map(d => d.device_id))
  .order('captured_at', { ascending: false })
  .limit(5);

console.log('Recent images:', images?.length || 0);
if (images && images.length > 0) {
  images.forEach(img => {
    console.log(`  MGI: ${img.mgi_score}, Vel: ${img.mgi_velocity}`);
  });
}
