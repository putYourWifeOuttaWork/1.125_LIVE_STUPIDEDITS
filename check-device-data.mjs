#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkDeviceData() {
  console.log('🔍 Checking device telemetry and MGI data...\n');

  // Get site
  const { data: site } = await supabase
    .from('sites')
    .select('site_id, name')
    .ilike('name', 'Iot Test Site 2')
    .single();

  if (!site) {
    console.log('❌ Site not found');
    return;
  }

  console.log(`✅ Site: ${site.name} (${site.site_id})\n`);

  // Check for telemetry
  const { data: telemetry, error: telError } = await supabase
    .from('device_telemetry')
    .select('device_id, temperature, humidity, captured_at')
    .order('captured_at', { ascending: false })
    .limit(5);

  console.log(`📊 Device Telemetry:`);
  if (telemetry && telemetry.length > 0) {
    console.log(`   Found ${telemetry.length} recent records`);
    telemetry.forEach(t => {
      console.log(`   - ${t.device_id.slice(0, 8)}... Temp: ${t.temperature}°F, Humidity: ${t.humidity}% at ${t.captured_at}`);
    });
  } else {
    console.log('   ⚠️  NO TELEMETRY DATA FOUND');
  }
  console.log('');

  // Check for images with MGI scores
  const { data: images, error: imgError } = await supabase
    .from('device_images')
    .select('device_id, mgi_score, mgi_velocity, captured_at')
    .not('mgi_score', 'is', null)
    .order('captured_at', { ascending: false })
    .limit(5);

  console.log(`📸 Device Images with MGI:`);
  if (images && images.length > 0) {
    console.log(`   Found ${images.length} recent images with MGI scores`);
    images.forEach(img => {
      console.log(`   - ${img.device_id.slice(0, 8)}... MGI: ${img.mgi_score}, Velocity: ${img.mgi_velocity} at ${img.captured_at}`);
    });
  } else {
    console.log('   ⚠️  NO IMAGES WITH MGI SCORES FOUND');
  }
  console.log('');

  // Check devices at the site
  const { data: devices } = await supabase
    .from('devices')
    .select('device_id, device_code, device_name')
    .eq('site_id', site.site_id);

  console.log(`🔧 Devices at site: ${devices?.length || 0}`);
  if (devices) {
    devices.forEach(d => {
      console.log(`   - ${d.device_code}: ${d.device_name}`);
    });
  }
}

checkDeviceData().then(() => process.exit(0));
