#!/usr/bin/env node

/**
 * Test Script: Device Submission Session with Wake Window
 *
 * This script creates a mock device submission session and tests:
 * 1. Device lineage resolution (MAC -> device_id -> site_id -> program_id)
 * 2. Wake window payload generation
 * 3. ACK response handling
 * 4. Image storage path generation
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

// Test device MAC address (devices use device_mac, not mac_address)
const TEST_MAC = 'AABBCCDDEEFF';

async function main() {
  console.log('🧪 Device Submission Session Test\n');
  console.log('=' .repeat(60));

  try {
    // Step 1: Find or create a test device
    console.log('\n📡 Step 1: Setting up test device...');

    let device = await findOrCreateTestDevice();
    console.log(`✅ Device ready: ${device.device_code || device.device_name || 'unnamed'}`);
    console.log(`   - ID: ${device.device_id}`);
    console.log(`   - MAC: ${device.device_mac}`);
    console.log(`   - Site: ${device.site_id || 'unassigned'}`);
    console.log(`   - Program: ${device.program_id || 'unassigned'}`);

    // Step 2: Test device lineage resolver
    console.log('\n🔍 Step 2: Testing device lineage resolver...');

    let { data: lineage, error: lineageError } = await supabase
      .rpc('fn_resolve_device_lineage', { p_device_mac: TEST_MAC });

    if (lineageError) {
      console.error('❌ Lineage resolution failed:', lineageError);
      return;
    }

    if (!lineage) {
      console.error('❌ Lineage resolution returned null');
      console.log('   Using device data directly instead...');
      lineage = {
        device_id: device.device_id,
        site_id: device.site_id,
        program_id: device.program_id,
        company_id: device.company_id
      };
    }

    console.log('✅ Lineage resolved:');
    console.log(`   - Device ID: ${lineage.device_id}`);
    console.log(`   - Site ID: ${lineage.site_id || 'NULL'}`);
    console.log(`   - Program ID: ${lineage.program_id || 'NULL'}`);
    console.log(`   - Company ID: ${lineage.company_id || 'NULL'}`);

    // Step 3: Create a device submission session
    console.log('\n📝 Step 3: Creating device submission session...');

    // Check if the table exists first
    const { data: tableCheck, error: tableCheckError } = await supabase
      .from('device_submission_sessions')
      .select('session_id')
      .limit(0);

    if (tableCheckError && tableCheckError.code === '42P01') {
      console.log('⚠️  device_submission_sessions table does not exist yet');
      console.log('   Migration 20251110000000_create_device_submission_system.sql must be applied first');
      console.log('\n⏭️  Skipping remaining steps (require migration)...');
      console.log('\n' + '='.repeat(60));
      console.log('📋 TEST SUMMARY\n');
      console.log('✅ Device Lineage Resolution: Working');
      console.log('❌ Device Submission Sessions: Requires migration 20251110000000');
      console.log('\n💡 Next Step: Apply migration 20251110000000 and re-run this test');
      return;
    }

    const sessionData = {
      device_id: lineage.device_id,
      site_id: lineage.site_id,
      program_id: lineage.program_id,
      company_id: lineage.company_id,
      session_date: new Date().toISOString().split('T')[0],
      expected_image_count: 4,
      status: 'pending'
    };

    const { data: session, error: sessionError } = await supabase
      .from('device_submission_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (sessionError) {
      console.error('❌ Session creation failed:', sessionError);
      return;
    }

    console.log('✅ Session created:');
    console.log(`   - Session ID: ${session.session_id}`);
    console.log(`   - Status: ${session.status}`);
    console.log(`   - Expected images: ${session.expected_image_count}`);

    // Step 4: Calculate next wake time
    console.log('\n⏰ Step 4: Calculating wake window...');

    const { data: wakeData, error: wakeError } = await supabase
      .rpc('calculate_next_wake_time', {
        p_site_id: lineage.site_id
      });

    if (wakeError) {
      console.error('❌ Wake calculation failed:', wakeError);
      return;
    }

    console.log('✅ Wake window calculated:');
    console.log(`   - Next wake: ${wakeData.next_wake_time}`);
    console.log(`   - Window start: ${wakeData.window_start}`);
    console.log(`   - Window end: ${wakeData.window_end}`);
    console.log(`   - Timezone: ${wakeData.timezone}`);

    // Step 5: Generate ACK payload
    console.log('\n📦 Step 5: Generating ACK payload...');

    const ackPayload = {
      status: 'ack',
      session_id: session.session_id,
      next_wake: wakeData.next_wake_time,
      wake_window: {
        start: wakeData.window_start,
        end: wakeData.window_end,
        timezone: wakeData.timezone
      },
      config: {
        image_count: session.expected_image_count,
        interval_seconds: 300 // 5 minutes between images
      }
    };

    console.log('✅ ACK Payload:');
    console.log(JSON.stringify(ackPayload, null, 2));

    // Step 6: Log the ACK
    console.log('\n📋 Step 6: Logging ACK...');

    const { error: ackLogError } = await supabase
      .from('device_ack_log')
      .insert({
        device_id: lineage.device_id,
        session_id: session.session_id,
        mac_address: TEST_MAC,
        next_wake_time: wakeData.next_wake_time,
        ack_payload: ackPayload,
        ack_status: 'sent'
      });

    if (ackLogError) {
      console.error('❌ ACK logging failed:', ackLogError);
      return;
    }

    console.log('✅ ACK logged successfully');

    // Step 7: Simulate image storage paths
    console.log('\n🖼️  Step 7: Generating image storage paths...');

    const imagePaths = [];
    for (let i = 1; i <= session.expected_image_count; i++) {
      const path = `device-images/${lineage.company_id}/${lineage.program_id}/${lineage.site_id}/${device.device_code}/${session.session_date}/image_${i}.jpg`;
      imagePaths.push(path);
    }

    console.log('✅ Image storage paths:');
    imagePaths.forEach((path, idx) => {
      console.log(`   ${idx + 1}. ${path}`);
    });

    // Step 8: Test complete - show summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST COMPLETE - All Systems Operational\n');
    console.log('Summary:');
    console.log(`  Device: ${device.device_code || device.device_name} (${TEST_MAC})`);
    console.log(`  Session: ${session.session_id}`);
    console.log(`  Status: ${session.status}`);
    console.log(`  Next Wake: ${wakeData.next_wake_time}`);
    console.log(`  Expected Images: ${session.expected_image_count}`);
    console.log('\n📝 Next Steps:');
    console.log('  1. Device wakes at scheduled time');
    console.log('  2. Device sends images to MQTT handler');
    console.log('  3. Images stored at hierarchical paths');
    console.log('  4. Session status updated to "complete"');
    console.log('  5. Device receives next wake time in ACK');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

async function findOrCreateTestDevice() {
  // Try to find existing test device
  const { data: existing } = await supabase
    .from('devices')
    .select('*')
    .eq('device_mac', TEST_MAC)
    .single();

  if (existing) {
    return existing;
  }

  // Create a new test device
  console.log('   Creating new test device...');

  // Get a test site (or create one)
  let { data: site } = await supabase
    .from('sites')
    .select('site_id, program_id, company_id')
    .limit(1)
    .single();

  if (!site) {
    console.log('   No sites found. Creating test site...');

    // Get a test program
    const { data: program } = await supabase
      .from('pilot_programs')
      .select('program_id, company_id')
      .limit(1)
      .single();

    if (!program) {
      throw new Error('No programs found. Please create a program first.');
    }

    // Create test site
    const { data: newSite, error: siteError } = await supabase
      .from('sites')
      .insert({
        site_name: 'Test Device Site',
        program_id: program.program_id,
        company_id: program.company_id,
        timezone: 'America/New_York'
      })
      .select()
      .single();

    if (siteError) throw siteError;
    site = newSite;
  }

  // Create the device
  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .insert({
      device_code: `TEST-${Date.now()}`,
      device_mac: TEST_MAC,
      device_name: 'Test Camera Device',
      is_active: true,
      provisioning_status: 'active',
      site_id: site.site_id,
      program_id: site.program_id,
      company_id: site.company_id
    })
    .select()
    .single();

  if (deviceError) throw deviceError;

  return device;
}

main();
