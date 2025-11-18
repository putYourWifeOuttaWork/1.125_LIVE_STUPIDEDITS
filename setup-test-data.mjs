import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n🧪 SETTING UP TEST DATA FOR IOT SITE\n');

// Step 1: Find the IoT program and site
console.log('📍 Step 1: Finding IoT program and site...');
const { data: sites, error: siteError } = await supabase
  .from('sites')
  .select('site_id, name, company_id, program_id')
  .ilike('name', '%IoT%');

if (siteError || !sites || sites.length === 0) {
  console.error('❌ Could not find IoT site:', siteError?.message);
  process.exit(1);
}

const site = sites[0];

// Get program info separately
const { data: program } = await supabase
  .from('pilot_programs')
  .select('program_name')
  .eq('program_id', site.program_id)
  .single();

console.log(`✅ Found site: ${site.name}`);
console.log(`   Program: ${program?.program_name || 'Unknown'}`);
console.log(`   Company ID: ${site.company_id}`);
console.log(`   Program ID: ${site.program_id}`);

// Step 2: Check for existing active session
console.log('\n📅 Step 2: Checking for site session...');
const sessionDate = new Date().toISOString().split('T')[0];

let { data: session, error: sessionCheckError } = await supabase
  .from('site_device_sessions')
  .select('session_id, status, expected_wake_count')
  .eq('site_id', site.site_id)
  .eq('session_date', sessionDate)
  .maybeSingle();

if (!session) {
  console.log('   Creating new session for today...');
  
  // Get site timezone info for proper session times
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const { data: newSession, error: createError } = await supabase
    .from('site_device_sessions')
    .insert({
      company_id: site.company_id,
      program_id: site.program_id,
      site_id: site.site_id,
      session_date: sessionDate,
      session_start_time: startOfDay.toISOString(),
      session_end_time: endOfDay.toISOString(),
      expected_wake_count: 15,
      status: 'in_progress'
    })
    .select()
    .single();

  if (createError) {
    console.error('❌ Failed to create session:', createError);
    process.exit(1);
  }
  
  session = newSession;
  console.log(`✅ Created new session (ID: ${session.session_id.substring(0, 8)}...)`);
} else {
  console.log(`✅ Using existing session (status: ${session.status})`);
}

// Step 3: Create or find devices
console.log('\n🤖 Step 3: Setting up devices...');

const devicePositions = [
  { x: 0, y: 0, name: 'NW Corner' },
  { x: 100, y: 0, name: 'NE Corner' },
  { x: 50, y: 50, name: 'Center' },
  { x: 0, y: 100, name: 'SW Corner' },
  { x: 100, y: 100, name: 'SE Corner' }
];

const devices = [];

for (let i = 0; i < devicePositions.length; i++) {
  const pos = devicePositions[i];
  const deviceCode = `LAB${String(i + 1).padStart(3, '0')}`;
  const deviceMac = `AA:BB:CC:DD:EE:${String(i).padStart(2, '0')}`;
  
  // Check if device exists
  let { data: existingDevice } = await supabase
    .from('devices')
    .select('device_id, device_name, device_code, site_id')
    .eq('device_code', deviceCode)
    .maybeSingle();

  if (existingDevice) {
    console.log(`   ✅ Found existing device: ${existingDevice.device_name}`);
    
    // Update position and site if needed
    if (existingDevice.site_id !== site.site_id) {
      await supabase
        .from('devices')
        .update({
          site_id: site.site_id,
          x_position: pos.x,
          y_position: pos.y
        })
        .eq('device_id', existingDevice.device_id);
      console.log(`      Updated site assignment and position`);
    }
    
    devices.push(existingDevice);
  } else {
    // Create new device
    const { data: newDevice, error: deviceError } = await supabase
      .from('devices')
      .insert({
        device_mac: deviceMac,
        device_name: `Lab Device ${i + 1} - ${pos.name}`,
        device_code: deviceCode,
        device_type: 'physical',
        provisioning_status: 'active',
        site_id: site.site_id,
        company_id: site.company_id,
        x_position: pos.x,
        y_position: pos.y
      })
      .select()
      .single();

    if (deviceError) {
      console.error(`   ❌ Failed to create device ${deviceCode}:`, deviceError.message);
      continue;
    }

    console.log(`   ✅ Created device: ${newDevice.device_name}`);
    devices.push(newDevice);
  }
}

console.log(`\n✅ Set up ${devices.length} devices`);

// Step 4: Upload images to storage
console.log('\n📸 Step 4: Uploading petri dish images...');

const PETRI_IMAGES = [
  'original.jpg',
  'original (1).jpg',
  'original (3).jpg',
  'original (4).jpg',
  'original (6).jpg'
];

async function uploadImage(localPath, remotePath) {
  try {
    const fileBuffer = readFileSync(join(process.cwd(), 'public', localPath));
    
    const { error } = await supabase.storage
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

// Step 5: Create wake payloads and images for each device
console.log('\n🎬 Step 5: Creating device wakes with real images...');

for (let deviceIndex = 0; deviceIndex < devices.length; deviceIndex++) {
  const device = devices[deviceIndex];
  const wakesPerDevice = 3; // 3 wakes per device
  
  console.log(`\n   Device: ${device.device_name}`);

  for (let wakeNum = 1; wakeNum <= wakesPerDevice; wakeNum++) {
    const imageFile = PETRI_IMAGES[deviceIndex % PETRI_IMAGES.length];
    const timestamp = Date.now() + (deviceIndex * 1000) + (wakeNum * 100);
    const capturedAt = new Date(Date.now() - (deviceIndex * 3600000) - (wakeNum * 600000)).toISOString();
    
    // Upload image
    const remotePath = `lab-test/${device.device_code}/${timestamp}_wake${wakeNum}.jpg`;
    console.log(`      Wake ${wakeNum}: Uploading ${imageFile}...`);
    const imageUrl = await uploadImage(imageFile, remotePath);
    
    if (!imageUrl) continue;

    // Create image record first
    const imageName = `${device.device_code}_wake${wakeNum}_${timestamp}.jpg`;
    const { data: imageRecord, error: imageError } = await supabase
      .from('device_images')
      .insert({
        company_id: site.company_id,
        program_id: site.program_id,
        site_id: site.site_id,
        device_id: device.device_id,
        image_name: imageName,
        captured_at: capturedAt,
        image_url: imageUrl,
        status: 'complete',
        received_at: capturedAt
      })
      .select()
      .single();

    if (imageError) {
      console.error(`         ❌ Image record failed:`, imageError.message);
      continue;
    }

    // Create wake payload
    const { data: payload, error: payloadError } = await supabase
      .from('device_wake_payloads')
      .insert({
        company_id: site.company_id,
        program_id: site.program_id,
        site_id: site.site_id,
        site_device_session_id: session.session_id,
        device_id: device.device_id,
        image_id: imageRecord.image_id,
        captured_at: capturedAt,
        received_at: capturedAt,
        wake_window_index: wakeNum,
        temperature: 20 + Math.random() * 5,
        humidity: 60 + Math.random() * 20,
        pressure: 1013 + Math.random() * 10,
        battery_voltage: 3.7 + Math.random() * 0.5,
        wifi_rssi: -60 - Math.floor(Math.random() * 30),
        image_status: 'complete',
        payload_status: 'complete'
      })
      .select()
      .single();

    if (payloadError) {
      console.error(`         ❌ Payload failed:`, payloadError.message);
      continue;
    }

    console.log(`         ✅ Wake ${wakeNum} complete with image`);
  }
}

console.log('\n\n✨ TEST DATA SETUP COMPLETE!\n');
console.log('📊 Summary:');
console.log(`   - Site: ${site.name}`);
console.log(`   - Devices: ${devices.length}`);
console.log(`   - Wakes per device: 3`);
console.log(`   - Total payloads: ${devices.length * 3}`);
console.log(`   - Session ID: ${session.session_id.substring(0, 8)}...`);
console.log('\n🎯 Next Steps:');
console.log('   1. Navigate to Lab → Ingest Feed');
console.log('   2. Check all filter tabs');
console.log('   3. View Site Setup to see device positions');
console.log('   4. Click on images to view them\n');

