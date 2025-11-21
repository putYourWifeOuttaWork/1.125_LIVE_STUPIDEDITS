import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🌱 Seeding device_images with FULL test data...\n');

async function seedCompleteImageData() {
  // Find devices with positions
  const { data: devices, error: devicesError } = await supabase
    .from('devices')
    .select('device_id, device_code, device_name, site_id, program_id, company_id, x_position, y_position')
    .not('x_position', 'is', null)
    .not('y_position', 'is', null)
    .not('site_id', 'is', null)
    .limit(10);

  if (devicesError || !devices || devices.length === 0) {
    console.error('Error or no devices:', devicesError);
    return;
  }

  console.log(`Found ${devices.length} devices\n`);

  const testScenarios = [
    { mgi: 0.05, velocity: 0.02, desc: 'Healthy + Low velocity' },
    { mgi: 0.08, velocity: 0.04, desc: 'Healthy + Normal velocity' },
    { mgi: 0.15, velocity: 0.06, desc: 'Warning + Elevated velocity' },
    { mgi: 0.20, velocity: 0.08, desc: 'Warning + High velocity' },
    { mgi: 0.30, velocity: 0.10, desc: 'Concerning + High velocity' },
    { mgi: 0.35, velocity: 0.12, desc: 'Concerning + Very high velocity' },
    { mgi: 0.45, velocity: 0.14, desc: 'Critical + Very high velocity' },
    { mgi: 0.50, velocity: 0.16, desc: 'Critical + Maximum velocity' },
    { mgi: 0.60, velocity: 0.18, desc: 'Critical + CRITICAL velocity' },
    { mgi: 0.75, velocity: 0.22, desc: 'Critical + Extreme velocity' },
  ];

  const now = new Date();
  
  // First, update devices table directly (this always works)
  console.log('📝 Updating devices table with latest MGI...\n');
  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];
    const scenario = testScenarios[i % testScenarios.length];

    await supabase
      .from('devices')
      .update({
        latest_mgi_score: scenario.mgi,
        latest_mgi_velocity: scenario.velocity,
        latest_mgi_at: now.toISOString(),
      })
      .eq('device_id', device.device_id);

    console.log(`✅ ${device.device_code}: ${scenario.desc}`);
    console.log(`   MGI: ${(scenario.mgi * 100).toFixed(1)}%, Velocity: ${(scenario.velocity * 100).toFixed(1)}%`);
  }

  // Now insert into device_images one at a time to handle any trigger issues
  console.log('\n📸 Creating device_images records...\n');
  
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];
    const scenario = testScenarios[i % testScenarios.length];
    const timestamp = Date.now() + i;

    const imageRecord = {
      device_id: device.device_id,
      site_id: device.site_id,
      program_id: device.program_id,
      company_id: device.company_id,
      captured_at: new Date(now.getTime() - (i * 60000)).toISOString(),
      observation_type: 'petri_dish',
      image_name: `test-${device.device_code}-${timestamp}.jpg`,
      image_url: `test-images/${device.device_code}-${timestamp}.jpg`,
      image_size: 1024000 + Math.floor(Math.random() * 500000),
      status: 'processed',
      mgi_score: scenario.mgi,
      mgi_velocity: scenario.velocity,
      scored_at: now.toISOString(),
      received_at: now.toISOString(),
      total_chunks: 1,
      received_chunks: 1,
    };

    const { data, error } = await supabase
      .from('device_images')
      .insert(imageRecord)
      .select('image_id');

    if (error) {
      console.log(`❌ ${device.device_code}: ${error.message.substring(0, 80)}`);
      failCount++;
    } else {
      console.log(`✅ ${device.device_code}: Image created (ID: ${data[0].image_id.substring(0, 8)}...)`);
      successCount++;
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`   ✅ Success: ${successCount} images`);
  console.log(`   ❌ Failed: ${failCount} images`);
  console.log(`   📝 Devices table: ${devices.length} updated`);

  console.log('\n✨ Seeding complete!');
  console.log('\n📋 Test Data Summary:');
  console.log('   🟢 Green (0-10 MGI): Small pulses');
  console.log('   🟡 Yellow (11-25 MGI): Medium pulses');
  console.log('   🟠 Orange (26-40 MGI): Large pulses');
  console.log('   🔴 Red (41+ MGI): Very large pulses');
  console.log('   ⚠️  Triangle (17+ velocity): Critical warning!');
}

seedCompleteImageData().catch(console.error);
