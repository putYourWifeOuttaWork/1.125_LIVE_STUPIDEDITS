import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n🧪 SQL-BASED DEVICE SIMULATOR\n');
console.log('This simulator creates device events directly in the database\n');

// Real petri dish images
const PETRI_IMAGES = [
  'original.jpg',
  'original-1.jpg',
  'original-3.jpg',
  'original-4.jpg',
  'original-6.jpg'
];

async function uploadImageToStorage(localPath, remotePath) {
  try {
    const fileBuffer = readFileSync(join(process.cwd(), 'public', localPath));
    
    const { data, error } = await supabase.storage
      .from('device-images')
      .upload(remotePath, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage
      .from('device-images')
      .getPublicUrl(remotePath);
    
    return publicUrl;
  } catch (err) {
    console.error(`   ❌ Failed to upload ${localPath}:`, err.message);
    return null;
  }
}

async function getOrCreateDevice() {
  // Try to find existing test device
  const { data: existing } = await supabase
    .from('devices')
    .select('device_id, device_name, device_mac')
    .eq('device_type', 'physical')
    .eq('provisioning_status', 'active')
    .limit(1)
    .maybeSingle();

  if (existing) {
    console.log(`✅ Using existing device: ${existing.device_name}`);
    return existing;
  }

  // Create new test device
  const deviceMac = `TEST:${Math.random().toString(16).substr(2, 12).toUpperCase()}`;
  const { data: newDevice, error} = await supabase
    .from('devices')
    .insert({
      device_mac: deviceMac,
      device_name: `Test Device ${deviceMac.slice(-4)}`,
      device_type: 'physical',
      device_code: `TEST${Math.floor(Math.random() * 10000)}`,
      provisioning_status: 'active',
      x_position: 0,
      y_position: 0
    })
    .select()
    .single();

  if (error) throw error;

  console.log(`✅ Created new device: ${newDevice.device_name}`);
  return newDevice;
}

async function getOrCreateSession(deviceId, siteId) {
  // Check for ANY existing session (not just active ones)
  const { data: existing, error: checkError } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, status')
    .eq('device_id', deviceId)
    .eq('site_id', siteId)
    .order('session_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (checkError) {
    console.error('Error checking existing sessions:', checkError);
  }

  if (existing) {
    console.log(`✅ Using existing session for ${existing.session_date} (status: ${existing.status})`);
    return existing.session_id;
  }

  // Create new session
  console.log('Creating new session...');
  const { data: directSession, error: insertError } = await supabase
    .from('site_device_sessions')
    .insert({
      device_id: deviceId,
      site_id: siteId,
      session_date: new Date().toISOString().split('T')[0],
      status: 'active',
      expected_images: 5,
      received_images: 0
    })
    .select('session_id')
    .single();

  if (insertError) {
    console.error('Direct insert error:', JSON.stringify(insertError, null, 2));
    throw new Error(`Failed to create session: ${insertError.message || 'Unknown error'}`);
  }

  console.log(`✅ Created new session`);
  return directSession.session_id;
}

async function simulateDeviceWake(device, siteId, sessionId, wakeNumber) {
  console.log(`\n📡 Simulating wake #${wakeNumber}...`);

  // 1. Create wake payload
  const { data: payload, error: payloadError } = await supabase
    .from('device_wake_payloads')
    .insert({
      device_id: device.device_id,
      session_id: sessionId,
      wake_number: wakeNumber,
      captured_at: new Date().toISOString(),
      battery_voltage: 3.7 + (Math.random() * 0.5),
      wifi_rssi: -60 - Math.floor(Math.random() * 30),
      expected_images: 1
    })
    .select()
    .single();

  if (payloadError) {
    console.error('   ❌ Failed to create payload:', payloadError.message);
    return null;
  }

  console.log(`   ✅ Created wake payload`);

  // 2. Create telemetry
  await supabase
    .from('device_telemetry')
    .insert({
      device_id: device.device_id,
      captured_at: new Date().toISOString(),
      temperature: 20 + Math.random() * 5,
      humidity: 60 + Math.random() * 20,
      pressure: 1013 + Math.random() * 10,
      battery_voltage: payload.battery_voltage,
      wifi_rssi: payload.wifi_rssi
    });

  console.log(`   ✅ Created telemetry`);

  // 3. Upload real petri image
  const imageFileName = PETRI_IMAGES[wakeNumber % PETRI_IMAGES.length];
  const remotePath = `test/${device.device_mac}/${Date.now()}_${imageFileName}`;
  
  console.log(`   📸 Uploading ${imageFileName}...`);
  const imageUrl = await uploadImageToStorage(imageFileName, remotePath);

  if (!imageUrl) {
    console.error('   ❌ Failed to upload image');
    return payload;
  }

  // 4. Create device_images record
  const { data: image, error: imageError } = await supabase
    .from('device_images')
    .insert({
      device_id: device.device_id,
      session_id: sessionId,
      payload_id: payload.payload_id,
      slot_index: 0,
      captured_at: new Date().toISOString(),
      image_url: imageUrl,
      status: 'complete',
      received_at: new Date().toISOString()
    })
    .select()
    .single();

  if (imageError) {
    console.error('   ❌ Failed to create image record:', imageError.message);
    return payload;
  }

  console.log(`   ✅ Image uploaded and recorded`);

  return payload;
}

async function run() {
  try {
    console.log('🔧 Step 1: Getting or creating test device...');
    const device = await getOrCreateDevice();

    console.log('\n🔧 Step 2: Finding a site...');
    const { data: site } = await supabase
      .from('sites')
      .select('site_id, name')
      .limit(1)
      .single();

    if (!site) {
      console.error('❌ No sites found. Please create a site first.');
      return;
    }
    console.log(`✅ Using site: ${site.name}`);

    console.log('\n🔧 Step 3: Getting or creating session...');
    const sessionId = await getOrCreateSession(device.device_id, site.site_id);

    console.log('\n🔧 Step 4: Simulating device wakes with REAL images...');
    
    // Simulate 5 wakes (one for each petri dish image)
    for (let i = 1; i <= 5; i++) {
      await simulateDeviceWake(device, site.site_id, sessionId, i);
      
      // Small delay between wakes
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n✅ SIMULATION COMPLETE!\n');
    console.log('🎯 Next Steps:');
    console.log('   1. Navigate to Lab → Ingest Feed');
    console.log('   2. Try all filter tabs (All, Payloads, Images, Telemetry)');
    console.log('   3. Click on images to view them in full size');
    console.log('   4. Check the device details page\n');

  } catch (error) {
    console.error('\n❌ Simulation failed:', error.message);
    console.error(error);
  }
}

run();
