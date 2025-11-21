import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🌱 Seeding "IoT Test Site 2" with diverse MGI test cases...\n');

async function seedIoTTestSite2() {
  // Find "IoT Test Site 2"
  const { data: site } = await supabase
    .from('sites')
    .select('site_id, name, program_id, company_id, length, width')
    .ilike('name', '%IoT Test Site 2%')
    .maybeSingle();

  if (!site) {
    console.log('❌ Could not find "IoT Test Site 2"');
    return;
  }

  console.log(`✅ Found site: ${site.name} (${site.site_id})\n`);

  // Get or create 5 test devices with specific positions for the site map
  const testDevices = [
    {
      code: 'DEVICE-ESP32S3-003',
      name: 'Low MGI Device (Green)',
      x: 30,
      y: 40,
      mgiScenario: 'healthy', // 0-10%
      targetMGI: 0.08,
      velocityPattern: 'slow' // 0-5%
    },
    {
      code: 'TEST-DEVICE-002',
      name: 'Warning MGI Device (Yellow)',
      x: 80,
      y: 20,
      mgiScenario: 'warning', // 11-25%
      targetMGI: 0.18,
      velocityPattern: 'medium' // 6-8%
    },
    {
      code: 'DEVICE-ESP32S3-004',
      name: 'Concerning MGI Device (Orange)',
      x: 50,
      y: 55,
      mgiScenario: 'concerning', // 26-40%
      targetMGI: 0.33,
      velocityPattern: 'high' // 9-12%
    },
    {
      code: 'MOCK-DEV-4484',
      name: 'Critical MGI Device (Red)',
      x: 75,
      y: 75,
      mgiScenario: 'critical', // 41%+
      targetMGI: 0.55,
      velocityPattern: 'very_high' // 13-16%
    },
    {
      code: 'DEVICE-ESP32S3-001',
      name: 'Critical Velocity Device (Red Triangle)',
      x: 25,
      y: 75,
      mgiScenario: 'critical', // 41%+
      targetMGI: 0.65,
      velocityPattern: 'critical' // 17%+
    }
  ];

  console.log('📍 Setting up 5 test devices with different MGI scenarios:\n');

  const deviceIds = [];

  for (const testDev of testDevices) {
    // Check if device exists
    let { data: device } = await supabase
      .from('devices')
      .select('device_id')
      .eq('device_code', testDev.code)
      .maybeSingle();

    if (!device) {
      // Create device
      const { data: newDevice, error } = await supabase
        .from('devices')
        .insert({
          device_code: testDev.code,
          device_name: testDev.name,
          device_mac: `AA:BB:CC:DD:EE:${testDevices.indexOf(testDev)}${testDevices.indexOf(testDev)}`,
          site_id: site.site_id,
          program_id: site.program_id,
          company_id: site.company_id,
          x_position: testDev.x,
          y_position: testDev.y,
          is_active: true,
          provisioning_status: 'active',
          device_type: 'physical'
        })
        .select('device_id')
        .single();

      if (error) {
        console.log(`❌ ${testDev.code}: Failed to create - ${error.message}`);
        continue;
      }
      device = newDevice;
      console.log(`✅ ${testDev.code}: Created at (${testDev.x}, ${testDev.y})`);
    } else {
      // Update position
      await supabase
        .from('devices')
        .update({
          x_position: testDev.x,
          y_position: testDev.y,
          site_id: site.site_id,
          program_id: site.program_id,
          company_id: site.company_id
        })
        .eq('device_id', device.device_id);
      console.log(`✅ ${testDev.code}: Updated position to (${testDev.x}, ${testDev.y})`);
    }

    deviceIds.push({ ...testDev, device_id: device.device_id });
  }

  console.log('\n📸 Creating image progression for each device...\n');

  const now = new Date();
  const imagesToCreate = [];

  for (const device of deviceIds) {
    // Create 6-8 images showing progression to target MGI
    const numImages = 6 + Math.floor(Math.random() * 3);
    const startMGI = 0.02 + Math.random() * 0.03; // Start low 2-5%
    const mgiStep = (device.targetMGI - startMGI) / (numImages - 1);

    // Velocity patterns
    const velocityRanges = {
      slow: [0.01, 0.05],      // 1-5%
      medium: [0.06, 0.08],     // 6-8%
      high: [0.09, 0.12],       // 9-12%
      very_high: [0.13, 0.16],  // 13-16%
      critical: [0.17, 0.22]    // 17%+
    };

    const [minVel, maxVel] = velocityRanges[device.velocityPattern];

    console.log(`  ${device.code} (${device.mgiScenario}): ${numImages} images, target ${(device.targetMGI * 100).toFixed(0)}%`);

    for (let i = 0; i < numImages; i++) {
      const daysAgo = (numImages - i) * 2;
      const capturedAt = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
      
      // Calculate MGI for this image
      const currentMGI = Math.min(device.targetMGI, startMGI + (mgiStep * i));
      
      const timestamp = Date.now() + deviceIds.indexOf(device) * 1000 + i;

      imagesToCreate.push({
        device_id: device.device_id,
        site_id: site.site_id,
        program_id: site.program_id,
        company_id: site.company_id,
        captured_at: capturedAt.toISOString(),
        observation_type: 'petri',
        image_name: `${device.code}-img${i+1}-${timestamp}.jpg`,
        image_url: `test-images/${device.code}-${timestamp}.jpg`,
        image_size: 1024000 + Math.floor(Math.random() * 500000),
        status: 'complete',
        mgi_score: currentMGI,
        // Note: velocity will be auto-calculated by trigger
        scored_at: capturedAt.toISOString(),
        received_at: capturedAt.toISOString(),
        total_chunks: 1,
        received_chunks: 1,
      });
    }
  }

  console.log(`\n📤 Inserting ${imagesToCreate.length} images...\n`);

  // Delete existing test images for these devices
  await supabase
    .from('device_images')
    .delete()
    .in('device_id', deviceIds.map(d => d.device_id));

  // Insert in batches
  const batchSize = 10;
  let successCount = 0;

  for (let i = 0; i < imagesToCreate.length; i += batchSize) {
    const batch = imagesToCreate.slice(i, i + batchSize);
    
    const { data, error } = await supabase
      .from('device_images')
      .insert(batch)
      .select('image_id');

    if (error) {
      console.log(`❌ Batch ${Math.floor(i/batchSize) + 1} failed:`, error.message);
    } else {
      successCount += data.length;
    }
  }

  console.log(`\n✅ Created ${successCount} images`);

  // Check devices table rollup
  const { data: updatedDevices } = await supabase
    .from('devices')
    .select('device_code, latest_mgi_score, latest_mgi_velocity, x_position, y_position')
    .in('device_id', deviceIds.map(d => d.device_id))
    .not('latest_mgi_score', 'is', null);

  console.log('\n📊 Final Device States:\n');
  updatedDevices?.forEach(d => {
    const mgi = (d.latest_mgi_score * 100).toFixed(1);
    const vel = (d.latest_mgi_velocity * 100).toFixed(1);
    
    let color = '🟢';
    if (d.latest_mgi_score > 0.40) color = '🔴';
    else if (d.latest_mgi_score > 0.25) color = '🟠';
    else if (d.latest_mgi_score > 0.10) color = '🟡';
    
    const triangle = d.latest_mgi_velocity >= 0.17 ? ' ⚠️' : '';
    
    console.log(`  ${color} ${d.device_code}: MGI ${mgi}%, Vel ${vel}%${triangle} @ (${d.x_position}, ${d.y_position})`);
  });

  console.log('\n✨ IoT Test Site 2 is ready for testing!');
  console.log('   Navigate to: "IoT Test Site 2 - Site Map" on HomePage\n');
}

seedIoTTestSite2().catch(console.error);
