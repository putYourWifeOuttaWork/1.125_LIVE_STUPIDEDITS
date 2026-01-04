#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkDevicePositions() {
  console.log('📍 DEVICE POSITIONING CHECK\n');

  // Get devices for IoT Test Site specifically
  const { data: iotSite } = await supabase
    .from('sites')
    .select('site_id, name')
    .eq('name', 'IoT Test Site')
    .single();

  if (!iotSite) {
    console.error('❌ IoT Test Site not found');
    return;
  }

  console.log(`Site: ${iotSite.name} (${iotSite.site_id})\n`);

  // Get devices for this site
  const { data: devices, error } = await supabase
    .from('devices')
    .select('device_id, device_code, device_name, x_position, y_position, is_active, provisioning_status')
    .eq('site_id', iotSite.site_id)
    .order('device_code');

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`Found ${devices.length} device(s) for IoT Test Site:\n`);

  const positioned = devices.filter(d => d.x_position !== null && d.y_position !== null);
  const unpositioned = devices.filter(d => d.x_position === null || d.y_position === null);
  const active = devices.filter(d => d.is_active);

  devices.forEach(d => {
    const hasPos = d.x_position !== null && d.y_position !== null;
    console.log(`  ${hasPos ? '✅' : '❌'} ${d.device_code}`);
    console.log(`     Name: ${d.device_name || 'N/A'}`);
    console.log(`     Position: ${d.x_position !== null ? `(${d.x_position}, ${d.y_position})` : 'NOT SET'}`);
    console.log(`     Active: ${d.is_active ? '✅' : '❌'}`);
    console.log(`     Status: ${d.provisioning_status}\n`);
  });

  console.log('\n📊 Summary:');
  console.log(`  Total devices: ${devices.length}`);
  console.log(`  ✅ With positions: ${positioned.length}`);
  console.log(`  ❌ Missing positions: ${unpositioned.length}`);
  console.log(`  🟢 Active: ${active.length}`);

  if (unpositioned.length > 0) {
    console.log('\n⚠️  Devices need positioning before visualizations will work!');
  } else {
    console.log('\n✅ All devices have positions - ready for visualization!');
  }

  return { devices, positioned: positioned.length, unpositioned: unpositioned.length };
}

checkDevicePositions().catch(console.error);
