#!/usr/bin/env node

/**
 * Check if raw telemetry and images exist but aren't linked to wake payloads
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const SESSION_ID = '4889eee2-6836-4f52-bbe4-9391e0930f88';

async function checkRawData() {
  console.log('🔍 Checking raw telemetry and image data...\n');

  // Get session details
  const { data: session } = await supabase
    .from('site_device_sessions')
    .select('*, sites(name)')
    .eq('session_id', SESSION_ID)
    .single();

  if (!session) {
    console.error('Session not found');
    return;
  }

  console.log(`Session: ${session.sites.name} on ${session.session_date}`);
  console.log(`Time: ${session.session_start_time} → ${session.session_end_time}\n`);

  // Check device_telemetry table
  console.log('📊 DEVICE_TELEMETRY TABLE');
  console.log('-'.repeat(80));

  const { data: telemetry, error: telError } = await supabase
    .from('device_telemetry')
    .select('telemetry_id, device_id, temperature, humidity, pressure, captured_at')
    .eq('site_id', session.site_id)
    .gte('captured_at', session.session_start_time)
    .lte('captured_at', session.session_end_time)
    .order('captured_at')
    .limit(10);

  if (telError) {
    console.error('❌ Error:', telError);
  } else if (!telemetry || telemetry.length === 0) {
    console.log('⚠️  NO telemetry data found in device_telemetry table');
    console.log('   This means MQTT handler is NOT writing telemetry at all!\n');
  } else {
    console.log(`✅ Found ${telemetry.length} telemetry records`);
    console.log('\nSample data:');
    telemetry.slice(0, 3).forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.captured_at}`);
      console.log(`     Temp: ${t.temperature}°F, Humidity: ${t.humidity}%, Pressure: ${t.pressure}`);
      console.log(`     Device: ${t.device_id}`);
    });
    console.log('\n✅ Telemetry data EXISTS but not in wake_payloads!\n');
  }

  // Check device_images table
  console.log('🖼️  DEVICE_IMAGES TABLE');
  console.log('-'.repeat(80));

  const { data: images, error: imgError } = await supabase
    .from('device_images')
    .select('image_id, device_id, captured_at, status, mgi_score')
    .eq('site_id', session.site_id)
    .gte('captured_at', session.session_start_time)
    .lte('captured_at', session.session_end_time)
    .order('captured_at')
    .limit(10);

  if (imgError) {
    console.error('❌ Error:', imgError);
  } else if (!images || images.length === 0) {
    console.log('⚠️  NO images found in device_images table');
    console.log('   Devices may not be capturing images, or images not uploaded\n');
  } else {
    console.log(`✅ Found ${images.length} images`);
    console.log('\nSample data:');
    images.slice(0, 3).forEach((img, i) => {
      console.log(`  ${i + 1}. ${img.captured_at}`);
      console.log(`     Status: ${img.status}, MGI: ${img.mgi_score || 'null'}`);
      console.log(`     Device: ${img.device_id}`);
    });
    console.log('\n✅ Images data EXISTS but not linked to wake_payloads!\n');
  }

  // Check device_wake_payloads for comparison
  console.log('📡 DEVICE_WAKE_PAYLOADS TABLE (for comparison)');
  console.log('-'.repeat(80));

  const { data: payloads } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, device_id, temperature, humidity, image_id, captured_at')
    .eq('site_device_session_id', SESSION_ID)
    .order('captured_at')
    .limit(10);

  if (payloads && payloads.length > 0) {
    console.log(`Found ${payloads.length} wake payloads`);
    const withTemp = payloads.filter(p => p.temperature !== null).length;
    const withHumidity = payloads.filter(p => p.humidity !== null).length;
    const withImages = payloads.filter(p => p.image_id !== null).length;

    console.log(`  With temperature: ${withTemp}/${payloads.length}`);
    console.log(`  With humidity: ${withHumidity}/${payloads.length}`);
    console.log(`  With images: ${withImages}/${payloads.length}\n`);
  }

  // Summary
  console.log('=' .repeat(80));
  console.log('DIAGNOSIS');
  console.log('=' .repeat(80));

  const hasTelemetry = telemetry && telemetry.length > 0;
  const hasImages = images && images.length > 0;
  const payloadsHaveTelemetry = payloads && payloads.some(p => p.temperature !== null);
  const payloadsHaveImages = payloads && payloads.some(p => p.image_id !== null);

  if (hasTelemetry && !payloadsHaveTelemetry) {
    console.log('\n❌ ISSUE #1: Telemetry exists but NOT linked to wake_payloads');
    console.log('   Problem: MQTT handler writes to device_telemetry but not device_wake_payloads');
    console.log('   Fix: Update MQTT handler to populate telemetry fields in wake_payloads');
    console.log('   OR: Create backfill script to link existing telemetry to payloads\n');
  }

  if (hasImages && !payloadsHaveImages) {
    console.log('❌ ISSUE #2: Images exist but NOT linked to wake_payloads');
    console.log('   Problem: device_wake_payloads.image_id is NULL');
    console.log('   Fix: Update MQTT handler to set image_id when image is received');
    console.log('   OR: Create backfill script to link existing images to payloads\n');
  }

  if (!hasTelemetry && !hasImages) {
    console.log('\n❌ CRITICAL: NO DATA AT ALL');
    console.log('   Problem: MQTT handler is not writing ANY data to database');
    console.log('   Fix: Check MQTT handler logs and verify devices are sending data\n');
  }

  if (hasTelemetry || hasImages) {
    console.log('\n🔧 RECOMMENDED ACTION:');
    console.log('   1. Create backfill script to populate wake_payloads from raw data');
    console.log('   2. Match telemetry/images to payloads by device_id + captured_at');
    console.log('   3. Regenerate snapshots after backfill');
    console.log('   4. Fix MQTT handler for future data\n');
  }
}

checkRawData().catch(console.error);
