#!/usr/bin/env node

/**
 * Backfill Wake Payload Data
 *
 * Links existing telemetry and images to wake_payloads by matching:
 * - device_id
 * - captured_at (within 5 second window)
 *
 * This fixes the issue where MQTT handler created wake_payloads but didn't
 * populate telemetry fields or link images.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function backfillSession(sessionId) {
  console.log(`\n🔧 Backfilling wake payload data for session: ${sessionId}\n`);

  // Get all wake payloads for this session
  const { data: payloads, error: payloadError } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, device_id, captured_at, temperature, humidity, image_id')
    .eq('site_device_session_id', sessionId)
    .order('captured_at');

  if (payloadError) {
    console.error('❌ Error fetching payloads:', payloadError);
    return;
  }

  if (!payloads || payloads.length === 0) {
    console.log('⚠️  No wake payloads found for this session');
    return;
  }

  console.log(`📦 Found ${payloads.length} wake payloads to process\n`);

  let telemetryLinked = 0;
  let imagesLinked = 0;
  let alreadyComplete = 0;

  for (const payload of payloads) {
    // Skip if already has data
    if (payload.temperature !== null && payload.image_id !== null) {
      alreadyComplete++;
      continue;
    }

    const updates = {};
    let needsUpdate = false;

    // Find matching telemetry (within 5 seconds)
    if (payload.temperature === null) {
      const capturedTime = new Date(payload.captured_at);
      const startTime = new Date(capturedTime.getTime() - 5000); // 5 seconds before
      const endTime = new Date(capturedTime.getTime() + 5000); // 5 seconds after

      const { data: telemetry } = await supabase
        .from('device_telemetry')
        .select('temperature, humidity, pressure, gas_resistance, wifi_rssi')
        .eq('device_id', payload.device_id)
        .gte('captured_at', startTime.toISOString())
        .lte('captured_at', endTime.toISOString())
        .order('captured_at')
        .limit(1)
        .single();

      if (telemetry) {
        updates.temperature = telemetry.temperature;
        updates.humidity = telemetry.humidity;
        updates.pressure = telemetry.pressure;
        updates.gas_resistance = telemetry.gas_resistance;
        updates.wifi_rssi = telemetry.wifi_rssi;
        needsUpdate = true;
        telemetryLinked++;
      }
    }

    // Find matching image (within 5 seconds)
    if (payload.image_id === null) {
      const capturedTime = new Date(payload.captured_at);
      const startTime = new Date(capturedTime.getTime() - 5000);
      const endTime = new Date(capturedTime.getTime() + 5000);

      const { data: image } = await supabase
        .from('device_images')
        .select('image_id')
        .eq('device_id', payload.device_id)
        .gte('captured_at', startTime.toISOString())
        .lte('captured_at', endTime.toISOString())
        .order('captured_at')
        .limit(1)
        .single();

      if (image) {
        updates.image_id = image.image_id;
        needsUpdate = true;
        imagesLinked++;
      }
    }

    // Apply updates
    if (needsUpdate) {
      const { error: updateError } = await supabase
        .from('device_wake_payloads')
        .update(updates)
        .eq('payload_id', payload.payload_id);

      if (updateError) {
        console.error(`  ❌ Error updating payload ${payload.payload_id}:`, updateError.message);
      } else {
        const updatedFields = [];
        if (updates.temperature !== undefined) updatedFields.push('telemetry');
        if (updates.image_id !== undefined) updatedFields.push('image');
        console.log(`  ✅ Updated payload ${payload.payload_id}: ${updatedFields.join(', ')}`);
      }
    }
  }

  console.log('\n📊 BACKFILL RESULTS');
  console.log('-'.repeat(80));
  console.log(`Total payloads: ${payloads.length}`);
  console.log(`Already complete: ${alreadyComplete}`);
  console.log(`Telemetry linked: ${telemetryLinked}`);
  console.log(`Images linked: ${imagesLinked}`);
  console.log('\n✅ Backfill complete!\n');

  return { telemetryLinked, imagesLinked };
}

async function regenerateSnapshots(sessionId) {
  console.log(`\n📸 Regenerating snapshots for session: ${sessionId}\n`);

  // Get session details
  const { data: session, error: sessionError } = await supabase
    .from('site_device_sessions')
    .select('session_start_time, session_end_time')
    .eq('session_id', sessionId)
    .single();

  if (sessionError || !session) {
    console.error('❌ Error fetching session:', sessionError);
    return;
  }

  // Delete existing snapshots
  const { error: deleteError } = await supabase
    .from('session_wake_snapshots')
    .delete()
    .eq('session_id', sessionId);

  if (deleteError) {
    console.error('❌ Error deleting old snapshots:', deleteError);
    return;
  }

  console.log('✅ Deleted old snapshots');

  // Get all unique wake windows from payloads
  const { data: wakeWindows, error: windowsError } = await supabase
    .from('device_wake_payloads')
    .select('wake_window_index')
    .eq('site_device_session_id', sessionId)
    .order('wake_window_index');

  if (windowsError || !wakeWindows) {
    console.error('❌ Error fetching wake windows:', windowsError);
    return;
  }

  const uniqueWindows = [...new Set(wakeWindows.map(w => w.wake_window_index).filter(w => w !== null))];
  console.log(`Found ${uniqueWindows.length} wake windows to process`);

  // Calculate time windows (assume 24 wakes per day = hourly)
  const sessionStart = new Date(session.session_start_time);
  const sessionEnd = new Date(session.session_end_time);
  const totalMs = sessionEnd.getTime() - sessionStart.getTime();
  const wakeCount = uniqueWindows.length || 24;
  const msPerWake = totalMs / wakeCount;

  for (let i = 0; i < uniqueWindows.length; i++) {
    const wakeNumber = i + 1;
    const wakeStart = new Date(sessionStart.getTime() + (i * msPerWake));
    const wakeEnd = new Date(wakeStart.getTime() + msPerWake);

    // Call snapshot generation function
    const { data, error } = await supabase
      .rpc('generate_session_wake_snapshot', {
        p_session_id: sessionId,
        p_wake_number: wakeNumber,
        p_wake_round_start: wakeStart.toISOString(),
        p_wake_round_end: wakeEnd.toISOString()
      });

    if (error) {
      console.error(`  ❌ Error generating snapshot #${wakeNumber}:`, error.message);
    } else {
      console.log(`  ✅ Generated snapshot #${wakeNumber}`);
    }
  }

  console.log('\n✅ Snapshot regeneration complete!\n');
}

async function main() {
  // Get recent session with data
  const { data: sessions } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, completed_wake_count')
    .order('session_date', { ascending: false })
    .limit(5);

  if (!sessions || sessions.length === 0) {
    console.error('No sessions found');
    return;
  }

  // Use session with most completed wakes
  const bestSession = sessions.reduce((prev, curr) =>
    (curr.completed_wake_count || 0) > (prev.completed_wake_count || 0) ? curr : prev
  );

  console.log('=' .repeat(80));
  console.log('WAKE PAYLOAD DATA BACKFILL');
  console.log('=' .repeat(80));
  console.log(`\nTarget session: ${bestSession.session_id}`);
  console.log(`Date: ${bestSession.session_date}`);
  console.log(`Completed wakes: ${bestSession.completed_wake_count}\n`);

  // Run backfill
  const results = await backfillSession(bestSession.session_id);

  // Only regenerate snapshots if we linked data
  if (results && (results.telemetryLinked > 0 || results.imagesLinked > 0)) {
    await regenerateSnapshots(bestSession.session_id);

    console.log('=' .repeat(80));
    console.log('✅ COMPLETE!');
    console.log('=' .repeat(80));
    console.log('\nNext steps:');
    console.log('1. Refresh the session detail page in UI');
    console.log('2. Analytics tab should now show charts with data');
    console.log('3. Images tab should show linked images');
    console.log('4. Map should animate with varying device states\n');
  } else {
    console.log('\n⚠️  No data was linked. Check if telemetry/images exist in raw tables.\n');
  }
}

main().catch(console.error);
