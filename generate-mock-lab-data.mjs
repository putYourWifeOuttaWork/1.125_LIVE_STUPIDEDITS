#!/usr/bin/env node
/**
 * Generate Mock Lab Data
 *
 * Creates realistic test data for the Lab UI including:
 * - Site device sessions
 * - Device wake payloads
 * - Device images with various statuses
 * - Submissions and observations
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Helper to generate random data
const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max) => Math.random() * (max - min) + min;

// Date helpers
function dateToString(date) {
  return date.toISOString().split('T')[0];
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function generateMockData() {
  console.log('🚀 Starting mock data generation...\n');

  // Step 1: Get user's company and program
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('❌ Not authenticated. Please log in first.');
    process.exit(1);
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .single();

  if (!profile?.company_id) {
    console.error('❌ No company found for user.');
    process.exit(1);
  }

  const companyId = profile.company_id;
  console.log(`✅ Using company: ${companyId}`);

  // Get a pilot program
  const { data: programs } = await supabase
    .from('pilot_programs')
    .select('program_id, program_name')
    .eq('company_id', companyId)
    .limit(1);

  if (!programs || programs.length === 0) {
    console.error('❌ No pilot program found. Please create one first.');
    process.exit(1);
  }

  const programId = programs[0].program_id;
  console.log(`✅ Using program: ${programs[0].program_name}\n`);

  // Step 2: Get or create a site
  let { data: sites } = await supabase
    .from('sites')
    .select('site_id, name')
    .eq('program_id', programId)
    .limit(1);

  let siteId;
  if (!sites || sites.length === 0) {
    console.log('📍 No site found, creating test site...');
    const { data: newSite, error } = await supabase
      .from('sites')
      .insert({
        company_id: companyId,
        program_id: programId,
        name: 'Test Lab Site',
        location: 'Lab Testing Facility',
        timezone: 'America/New_York',
        site_type: 'petri'
      })
      .select()
      .single();

    if (error) throw error;
    siteId = newSite.site_id;
    console.log(`✅ Created site: ${newSite.name}`);
  } else {
    siteId = sites[0].site_id;
    console.log(`✅ Using existing site: ${sites[0].name}`);
  }

  // Step 3: Get or create devices
  let { data: devices } = await supabase
    .from('devices')
    .select('device_id, device_mac, device_name')
    .eq('site_id', siteId);

  if (!devices || devices.length === 0) {
    console.log('\n📱 Creating test devices...');
    const devicesToCreate = [
      { mac: 'AA:BB:CC:DD:EE:01', name: 'Device Alpha' },
      { mac: 'AA:BB:CC:DD:EE:02', name: 'Device Beta' },
      { mac: 'AA:BB:CC:DD:EE:03', name: 'Device Gamma' }
    ];

    const { data: newDevices, error } = await supabase
      .from('devices')
      .insert(
        devicesToCreate.map(d => ({
          device_mac: d.mac,
          device_name: d.name,
          site_id: siteId,
          program_id: programId,
          firmware_version: '1.0.0',
          is_active: true,
          battery_voltage: randomFloat(3.5, 4.2),
          battery_health_percent: randomInt(70, 100)
        }))
      )
      .select();

    if (error) throw error;
    devices = newDevices;
    console.log(`✅ Created ${devices.length} devices`);
  } else {
    console.log(`\n✅ Using ${devices.length} existing devices`);
  }

  // Step 4: Generate sessions and data for last 7 days
  console.log('\n📅 Generating sessions for last 7 days...');

  const today = new Date();
  const daysToGenerate = 7;

  for (let dayOffset = 0; dayOffset < daysToGenerate; dayOffset++) {
    const sessionDate = addDays(today, -dayOffset);
    const dateString = dateToString(sessionDate);

    console.log(`\n  Day ${dayOffset + 1}: ${dateString}`);

    // Create session
    const expectedWakes = 12; // 12 wake events per day
    const { data: session, error: sessionError } = await supabase
      .from('site_device_sessions')
      .insert({
        company_id: companyId,
        program_id: programId,
        site_id: siteId,
        session_date: dateString,
        session_start_time: new Date(sessionDate.setHours(6, 0, 0, 0)).toISOString(),
        session_end_time: new Date(sessionDate.setHours(18, 0, 0, 0)).toISOString(),
        expected_wake_count: expectedWakes,
        status: 'active'
      })
      .select()
      .single();

    if (sessionError) {
      if (sessionError.code === '23505') {
        console.log(`    ⏭️  Session already exists, skipping...`);
        continue;
      }
      throw sessionError;
    }

    console.log(`    ✅ Created session: ${session.session_id.substring(0, 8)}...`);

    // Generate wake payloads for each device
    let payloadCount = 0;
    let imageCount = 0;

    for (const device of devices) {
      const wakesForDevice = randomInt(3, 5); // Each device wakes 3-5 times

      for (let wakeIndex = 0; wakeIndex < wakesForDevice; wakeIndex++) {
        const wakeHour = randomInt(6, 17);
        const wakeMinute = randomInt(0, 59);
        const capturedAt = new Date(sessionDate);
        capturedAt.setHours(wakeHour, wakeMinute, 0, 0);

        // Randomly decide if this wake includes an image
        const hasImage = Math.random() > 0.2; // 80% have images

        let imageId = null;
        if (hasImage) {
          // Create device image
          const imageStatus = randomChoice(['complete', 'complete', 'complete', 'receiving', 'failed']);
          const totalChunks = randomInt(50, 150);
          const receivedChunks = imageStatus === 'complete' ? totalChunks : randomInt(0, totalChunks);

          const { data: image } = await supabase
            .from('device_images')
            .insert({
              device_id: device.device_id,
              company_id: companyId,
              image_name: `IMG_${dateString}_${device.device_name}_${wakeIndex}.jpg`,
              captured_at: capturedAt.toISOString(),
              received_at: imageStatus !== 'pending' ? new Date(capturedAt.getTime() + randomInt(1000, 30000)).toISOString() : null,
              total_chunks: totalChunks,
              received_chunks: receivedChunks,
              status: imageStatus,
              image_size: randomInt(50000, 200000),
              observation_type: 'petri'
            })
            .select()
            .single();

          imageId = image.image_id;
          imageCount++;
        }

        // Create wake payload
        const payloadStatus = hasImage
          ? (imageId ? randomChoice(['complete', 'complete', 'pending']) : 'failed')
          : 'complete';

        await supabase
          .from('device_wake_payloads')
          .insert({
            company_id: companyId,
            program_id: programId,
            site_id: siteId,
            site_device_session_id: session.session_id,
            device_id: device.device_id,
            captured_at: capturedAt.toISOString(),
            received_at: new Date(capturedAt.getTime() + randomInt(100, 5000)).toISOString(),
            wake_window_index: wakeIndex,
            image_id: imageId,
            image_status: hasImage ? randomChoice(['complete', 'receiving', 'pending']) : null,
            temperature: randomFloat(20, 30),
            humidity: randomFloat(40, 70),
            battery_voltage: randomFloat(3.5, 4.2),
            wifi_rssi: randomInt(-80, -40),
            payload_status: payloadStatus
          });

        payloadCount++;
      }
    }

    // Update session counts
    await supabase
      .from('site_device_sessions')
      .update({
        completed_wake_count: payloadCount,
        failed_wake_count: 0
      })
      .eq('session_id', session.session_id);

    console.log(`    📊 Generated ${payloadCount} wake payloads, ${imageCount} images`);
  }

  console.log('\n✅ Mock data generation complete!');
  console.log('\n📋 Summary:');
  console.log(`   - Site: ${siteId.substring(0, 8)}...`);
  console.log(`   - Devices: ${devices.length}`);
  console.log(`   - Days: ${daysToGenerate}`);
  console.log(`   - Sessions: ${daysToGenerate}`);
  console.log('\n🔬 You can now view this data in the Lab UI!');
  console.log('   Go to: Lab > Site Sessions');
}

// Run the script
generateMockData().catch(error => {
  console.error('\n❌ Error generating mock data:', error.message);
  process.exit(1);
});
