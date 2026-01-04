#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseSnapshotAggregation() {
  console.log('=== SNAPSHOT AGGREGATION DIAGNOSIS ===\n');

  // Get the session from the screenshot (session_id from the snapshot data)
  const sessionId = '4889eee2-6836-4f52-bbe4-9391e0930f88';
  const siteId = '4a21ccd9-56c5-48b2-90ca-c5fb756803d6';

  console.log(`Analyzing session: ${sessionId}`);
  console.log(`Site: ${siteId}\n`);

  // 1. Check existing snapshots for this session
  console.log('--- EXISTING SNAPSHOTS ---');
  const { data: snapshots, error: snapshotError } = await supabase
    .from('session_wake_snapshots')
    .select('*')
    .eq('session_id', sessionId)
    .order('wake_number', { ascending: true });

  if (snapshotError) {
    console.error('Error fetching snapshots:', snapshotError);
  } else {
    console.log(`Total snapshots: ${snapshots.length}`);
    if (snapshots.length > 0) {
      console.log('\nSnapshot wake windows:');
      snapshots.slice(0, 5).forEach(s => {
        console.log(`  Wake ${s.wake_number}: ${s.wake_round_start} to ${s.wake_round_end}`);
        console.log(`    - new_images_this_round: ${s.new_images_this_round}`);
        console.log(`    - avg_temperature: ${s.avg_temperature}`);
        console.log(`    - avg_humidity: ${s.avg_humidity}`);
      });
    }
  }

  // 2. Check actual device_wake_payloads data
  console.log('\n--- DEVICE WAKE PAYLOADS ---');
  const { data: payloads, error: payloadError } = await supabase
    .from('device_wake_payloads')
    .select('*')
    .eq('session_id', sessionId)
    .order('captured_at', { ascending: true });

  if (payloadError) {
    console.error('Error fetching payloads:', payloadError);
  } else {
    console.log(`Total payloads: ${payloads.length}`);
    if (payloads.length > 0) {
      console.log('\nPayload timestamps:');
      payloads.slice(0, 10).forEach(p => {
        console.log(`  Wake window ${p.wake_window_index}: ${p.captured_at}`);
        console.log(`    - image_id: ${p.image_id ? 'Yes' : 'No'}`);
        console.log(`    - telemetry: ${p.telemetry_data ? 'Yes' : 'No'}`);
      });
    }
  }

  // 3. Check device_images data
  console.log('\n--- DEVICE IMAGES ---');
  const { data: images, error: imageError } = await supabase
    .from('device_images')
    .select('image_id, device_id, captured_at, mgi_score')
    .eq('site_id', siteId)
    .gte('captured_at', '2026-01-04T00:00:00Z')
    .lte('captured_at', '2026-01-04T18:00:00Z')
    .order('captured_at', { ascending: true });

  if (imageError) {
    console.error('Error fetching images:', imageError);
  } else {
    console.log(`Total images in session timeframe: ${images.length}`);
    if (images.length > 0) {
      console.log('\nImage timestamps:');
      images.slice(0, 10).forEach(img => {
        console.log(`  ${img.captured_at} - MGI: ${img.mgi_score}`);
      });
    }
  }

  // 4. Check device_telemetry data
  console.log('\n--- DEVICE TELEMETRY ---');
  const { data: telemetry, error: telemetryError } = await supabase
    .from('device_telemetry')
    .select('telemetry_id, device_id, captured_at, temperature, humidity')
    .eq('site_id', siteId)
    .gte('captured_at', '2026-01-04T00:00:00Z')
    .lte('captured_at', '2026-01-04T18:00:00Z')
    .order('captured_at', { ascending: true });

  if (telemetryError) {
    console.error('Error fetching telemetry:', telemetryError);
  } else {
    console.log(`Total telemetry records in session timeframe: ${telemetry.length}`);
    if (telemetry.length > 0) {
      console.log('\nTelemetry timestamps:');
      telemetry.slice(0, 10).forEach(t => {
        console.log(`  ${t.captured_at} - Temp: ${t.temperature}, Humidity: ${t.humidity}`);
      });
    }
  }

  // 5. Compare wake window 12 (which has 1 image according to snapshot data)
  console.log('\n--- DETAILED ANALYSIS: Wake 12 ---');
  const wake12Snapshot = snapshots.find(s => s.wake_number === 12);
  if (wake12Snapshot) {
    console.log(`Snapshot window: ${wake12Snapshot.wake_round_start} to ${wake12Snapshot.wake_round_end}`);
    console.log(`Snapshot reports: ${wake12Snapshot.new_images_this_round} images`);

    // Check actual images in that window
    const { data: imagesInWindow } = await supabase
      .from('device_images')
      .select('*')
      .eq('site_id', siteId)
      .gte('captured_at', wake12Snapshot.wake_round_start)
      .lte('captured_at', wake12Snapshot.wake_round_end);

    console.log(`Actual images in that time window: ${imagesInWindow?.length || 0}`);

    // Check payloads for wake 12
    const wake12Payloads = payloads.filter(p => p.wake_window_index === 12);
    console.log(`Payloads with wake_window_index=12: ${wake12Payloads.length}`);
    if (wake12Payloads.length > 0) {
      wake12Payloads.forEach(p => {
        console.log(`  Payload captured_at: ${p.captured_at}`);
        console.log(`  Payload has image_id: ${p.image_id ? 'Yes' : 'No'}`);
      });
    }

    // Check if images exist with wake_window_index or by joining through payloads
    if (wake12Payloads.length > 0 && wake12Payloads[0].image_id) {
      const { data: imageData } = await supabase
        .from('device_images')
        .select('*')
        .eq('image_id', wake12Payloads[0].image_id)
        .single();

      if (imageData) {
        console.log(`\nImage linked from payload:`);
        console.log(`  captured_at: ${imageData.captured_at}`);
        console.log(`  Falls in snapshot window: ${imageData.captured_at >= wake12Snapshot.wake_round_start && imageData.captured_at <= wake12Snapshot.wake_round_end}`);
      }
    }
  }

  console.log('\n=== DIAGNOSIS COMPLETE ===');
}

diagnoseSnapshotAggregation().catch(console.error);
