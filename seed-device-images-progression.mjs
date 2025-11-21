import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🌱 Seeding device_images with MGI progression data...\n');

async function seedImageProgression() {
  const { data: devices } = await supabase
    .from('devices')
    .select('device_id, device_code, device_name, site_id, program_id, company_id, x_position, y_position')
    .not('x_position', 'is', null)
    .not('y_position', 'is', null)
    .not('site_id', 'is', null)
    .limit(10);

  if (!devices || devices.length === 0) {
    console.log('❌ No devices found');
    return;
  }

  console.log(`Found ${devices.length} devices\n`);

  // Create progression scenarios for each device
  const imagesToCreate = [];
  const now = new Date();

  devices.forEach((device, deviceIndex) => {
    // Each device gets 5-8 images showing MGI progression over time
    const numImages = 5 + Math.floor(Math.random() * 4); // 5-8 images
    const baseVelocity = [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18, 0.22][deviceIndex % 10];
    
    console.log(`📸 ${device.device_code}: Creating ${numImages} images`);
    
    for (let i = 0; i < numImages; i++) {
      // Simulate MGI growth over time
      const daysAgo = (numImages - i) * 2; // Spaced 2 days apart
      const capturedAt = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
      
      // MGI grows over time with some variation
      const baseMGI = [0.05, 0.08, 0.15, 0.20, 0.30, 0.35, 0.45, 0.50, 0.60, 0.75][deviceIndex % 10];
      const growthFactor = i / (numImages - 1); // 0 to 1
      const mgiScore = Math.min(0.95, baseMGI + (growthFactor * 0.3)); // Grow but cap at 95%
      
      // Velocity varies slightly
      const velocity = baseVelocity + (Math.random() * 0.02 - 0.01); // +/- 1%
      
      const timestamp = Date.now() + deviceIndex * 1000 + i;
      
      imagesToCreate.push({
        device_id: device.device_id,
        site_id: device.site_id,
        program_id: device.program_id,
        company_id: device.company_id,
        captured_at: capturedAt.toISOString(),
        observation_type: 'petri',
        image_name: `${device.device_code}-img${i+1}-${timestamp}.jpg`,
        image_url: `test-images/${device.device_code}-${timestamp}.jpg`,
        image_size: 1024000 + Math.floor(Math.random() * 500000),
        status: 'complete',
        mgi_score: mgiScore,
        mgi_velocity: velocity,
        scored_at: capturedAt.toISOString(),
        received_at: capturedAt.toISOString(),
        total_chunks: 1,
        received_chunks: 1,
      });
      
      console.log(`   Image ${i+1}: MGI ${(mgiScore*100).toFixed(1)}%, Vel ${(velocity*100).toFixed(1)}%, ${daysAgo}d ago`);
    }
    console.log('');
  });

  console.log(`\n📤 Inserting ${imagesToCreate.length} images into device_images...\n`);

  // Insert in batches of 10 to avoid timeouts
  const batchSize = 10;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < imagesToCreate.length; i += batchSize) {
    const batch = imagesToCreate.slice(i, i + batchSize);
    
    const { data, error } = await supabase
      .from('device_images')
      .insert(batch)
      .select('image_id');

    if (error) {
      console.log(`❌ Batch ${Math.floor(i/batchSize) + 1} failed:`, error.message);
      failCount += batch.length;
    } else {
      console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}: ${data.length} images created`);
      successCount += data.length;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Success: ${successCount} images`);
  console.log(`   ❌ Failed: ${failCount} images`);
  console.log(`   📈 Total attempted: ${imagesToCreate.length} images`);

  if (successCount > 0) {
    console.log(`\n🔄 Checking device table updates...`);
    
    const { data: updatedDevices } = await supabase
      .from('devices')
      .select('device_code, latest_mgi_score, latest_mgi_velocity')
      .in('device_id', devices.map(d => d.device_id))
      .not('latest_mgi_score', 'is', null);

    if (updatedDevices && updatedDevices.length > 0) {
      console.log(`\n✅ ${updatedDevices.length} devices now have MGI data:`);
      updatedDevices.forEach(d => {
        const mgi = (d.latest_mgi_score * 100).toFixed(1);
        const vel = (d.latest_mgi_velocity * 100).toFixed(1);
        const color = mgi <= 10 ? '🟢' : mgi <= 25 ? '🟡' : mgi <= 40 ? '🟠' : '🔴';
        const triangle = vel > 16 ? ' ⚠️' : '';
        console.log(`   ${color} ${d.device_code}: MGI ${mgi}%, Vel ${vel}%${triangle}`);
      });
    }
  }

  console.log(`\n✨ Seeding complete!`);
}

seedImageProgression().catch(console.error);
