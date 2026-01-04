#!/usr/bin/env node

/**
 * Session Detail Page Data Flow Diagnostic
 *
 * Investigates why session detail page shows:
 * - 0 images (when images exist)
 * - Blank analytics tab
 * - Missing visualization data
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

// Use a recent session ID - replace with actual session ID from your screenshot
const SESSION_ID = '2b8a8468-1c92-4553-a044-edb60b0ba7c5'; // This appears to be a device ID, not session ID
// Let me find a real session ID first

async function findRecentSession() {
  console.log('🔍 Finding recent session with data...\n');

  const { data: sessions, error } = await supabase
    .from('site_device_sessions')
    .select('session_id, site_id, session_date, session_start_time, session_end_time, expected_wake_count, completed_wake_count, failed_wake_count')
    .order('session_date', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching sessions:', error);
    return null;
  }

  console.log('Recent sessions:');
  sessions.forEach((s, i) => {
    console.log(`${i + 1}. ${s.session_id}`);
    console.log(`   Date: ${s.session_date}`);
    console.log(`   Expected wakes: ${s.expected_wake_count}, Completed: ${s.completed_wake_count}`);
  });

  // Return session with most completed wakes
  const bestSession = sessions.reduce((prev, curr) =>
    (curr.completed_wake_count || 0) > (prev.completed_wake_count || 0) ? curr : prev
  );

  console.log(`\n✅ Using session: ${bestSession.session_id}\n`);
  return bestSession.session_id;
}

async function diagnoseSession(sessionId) {
  console.log('=' .repeat(80));
  console.log(`DIAGNOSING SESSION: ${sessionId}`);
  console.log('=' .repeat(80));

  // 1. Check session details
  console.log('\n📋 1. SESSION DETAILS');
  console.log('-'.repeat(80));

  const { data: session, error: sessionError } = await supabase
    .from('site_device_sessions')
    .select('*, sites(name, site_code), pilot_programs(name)')
    .eq('session_id', sessionId)
    .single();

  if (sessionError) {
    console.error('❌ Error:', sessionError);
    return;
  }

  console.log(`Site: ${session.sites.name} (${session.sites.site_code})`);
  console.log(`Program: ${session.pilot_programs.name}`);
  console.log(`Date: ${session.session_date}`);
  console.log(`Time: ${session.session_start_time} → ${session.session_end_time}`);
  console.log(`Expected wakes: ${session.expected_wake_count}`);
  console.log(`Completed wakes: ${session.completed_wake_count}`);
  console.log(`Failed wakes: ${session.failed_wake_count}`);
  console.log(`Extra wakes: ${session.extra_wake_count}`);

  // 2. Check snapshots
  console.log('\n📸 2. SNAPSHOT DATA');
  console.log('-'.repeat(80));

  const { data: snapshots, error: snapshotError } = await supabase
    .from('session_wake_snapshots')
    .select('snapshot_id, wake_number, active_devices_count, new_images_this_round, avg_temperature, avg_humidity, avg_mgi, max_mgi')
    .eq('session_id', sessionId)
    .order('wake_number');

  if (snapshotError) {
    console.error('❌ Error:', snapshotError);
  } else if (!snapshots || snapshots.length === 0) {
    console.log('⚠️  NO SNAPSHOTS FOUND! This is the primary issue.');
    console.log('    Analytics tab needs snapshots to render charts.');
    console.log('    Map visualization needs snapshots for timeline playback.');
  } else {
    console.log(`✅ Found ${snapshots.length} snapshots`);
    console.log('\nSample snapshot data:');
    const sample = snapshots[0];
    console.log(`  Wake #${sample.wake_number}:`);
    console.log(`    Active devices: ${sample.active_devices_count}`);
    console.log(`    New images: ${sample.new_images_this_round}`);
    console.log(`    Avg temp: ${sample.avg_temperature}`);
    console.log(`    Avg humidity: ${sample.avg_humidity}`);
    console.log(`    Avg MGI: ${sample.avg_mgi}`);
    console.log(`    Max MGI: ${sample.max_mgi}`);

    // Check if data is varying
    const temps = snapshots.map(s => s.avg_temperature).filter(t => t !== null);
    const uniqueTemps = new Set(temps);
    if (uniqueTemps.size === 1) {
      console.log('\n⚠️  WARNING: All snapshots have IDENTICAL temperature data!');
      console.log('    This will cause static visualization (no animation).');
    } else {
      console.log(`\n✅ Temperature varies across ${uniqueTemps.size} unique values`);
    }
  }

  // 3. Check RPC function response
  console.log('\n🔧 3. RPC FUNCTION TEST: get_session_devices_with_wakes');
  console.log('-'.repeat(80));

  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_session_devices_with_wakes', {
      p_session_id: sessionId
    });

  if (rpcError) {
    console.error('❌ Error:', rpcError);
  } else if (!rpcData) {
    console.log('⚠️  RPC returned NULL');
  } else {
    console.log('✅ RPC function succeeded');
    console.log(`\nResponse structure:`);
    console.log(`  session_id: ${rpcData.session_id}`);
    console.log(`  site_id: ${rpcData.site_id}`);
    console.log(`  devices: ${rpcData.devices?.length || 0} devices`);

    if (rpcData.devices && rpcData.devices.length > 0) {
      const device = rpcData.devices[0];
      console.log(`\nSample device data (${device.device_code}):`);
      console.log(`  Expected wakes: ${device.expected_wakes_in_session}`);
      console.log(`  Actual wakes: ${device.actual_wakes}`);
      console.log(`  Completed wakes: ${device.completed_wakes}`);
      console.log(`  Images: ${device.images?.length || 0}`);
      console.log(`  Wake payloads: ${device.wake_payloads?.length || 0}`);

      if (device.images && device.images.length > 0) {
        console.log('\n✅ Images ARE linked to wake payloads');
        console.log(`   Sample image: ${device.images[0].image_id}`);
        console.log(`   Image URL: ${device.images[0].image_url || 'MISSING'}`);
        console.log(`   Storage path: ${device.images[0].storage_path || 'MISSING'}`);
      } else {
        console.log('\n⚠️  NO IMAGES in RPC response');
        console.log('   This is why Images tab shows "0 images"');
      }

      if (device.wake_payloads && device.wake_payloads.length > 0) {
        const payload = device.wake_payloads[0];
        console.log('\nSample wake payload:');
        console.log(`  Wake window: ${payload.wake_window_index}`);
        console.log(`  Status: ${payload.payload_status}`);
        console.log(`  Temperature: ${payload.temperature}`);
        console.log(`  Humidity: ${payload.humidity}`);
        console.log(`  Image ID: ${payload.image_id || 'NULL'}`);
      }
    }
  }

  // 4. Check raw image data
  console.log('\n🖼️  4. RAW IMAGE DATA CHECK');
  console.log('-'.repeat(80));

  const { data: images, error: imageError } = await supabase
    .from('device_images')
    .select('image_id, device_id, captured_at, status, mgi_score, storage_path, image_url, site_device_session_id')
    .eq('site_device_session_id', sessionId)
    .limit(5);

  if (imageError) {
    console.error('❌ Error:', imageError);
  } else if (!images || images.length === 0) {
    console.log('⚠️  NO IMAGES found with site_device_session_id');
    console.log('   Checking if images exist but not linked to session...');

    // Check images for this site/date
    const { data: unlinkedImages } = await supabase
      .from('device_images')
      .select('image_id, device_id, captured_at, site_device_session_id')
      .eq('site_id', session.site_id)
      .gte('captured_at', session.session_start_time)
      .lte('captured_at', session.session_end_time)
      .limit(5);

    if (unlinkedImages && unlinkedImages.length > 0) {
      console.log(`\n⚠️  Found ${unlinkedImages.length} images in timeframe but NOT linked to session!`);
      console.log('   Image session IDs:', unlinkedImages.map(i => i.site_device_session_id));
      console.log('   Expected session ID:', sessionId);
    }
  } else {
    console.log(`✅ Found ${images.length} images (showing first 5)`);
    images.forEach((img, i) => {
      console.log(`\n  Image ${i + 1}:`);
      console.log(`    ID: ${img.image_id}`);
      console.log(`    Device: ${img.device_id}`);
      console.log(`    Captured: ${img.captured_at}`);
      console.log(`    Status: ${img.status}`);
      console.log(`    MGI: ${img.mgi_score}`);
      console.log(`    Storage path: ${img.storage_path || 'NULL'}`);
      console.log(`    Image URL: ${img.image_url || 'NULL'}`);
      console.log(`    Session ID: ${img.site_device_session_id}`);
    });
  }

  // 5. Check wake payloads
  console.log('\n📡 5. WAKE PAYLOAD DATA CHECK');
  console.log('-'.repeat(80));

  const { data: wakePayloads, error: payloadError } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, device_id, wake_window_index, payload_status, temperature, humidity, image_id, captured_at')
    .eq('site_device_session_id', sessionId)
    .order('captured_at')
    .limit(10);

  if (payloadError) {
    console.error('❌ Error:', payloadError);
  } else if (!wakePayloads || wakePayloads.length === 0) {
    console.log('⚠️  NO WAKE PAYLOADS found for this session');
  } else {
    console.log(`✅ Found ${wakePayloads.length} wake payloads (showing first 10)`);

    const withImages = wakePayloads.filter(p => p.image_id !== null).length;
    console.log(`   Payloads with images: ${withImages}/${wakePayloads.length}`);

    console.log('\nSample wake payloads:');
    wakePayloads.slice(0, 3).forEach((p, i) => {
      console.log(`\n  Payload ${i + 1}:`);
      console.log(`    Wake window: ${p.wake_window_index}`);
      console.log(`    Status: ${p.payload_status}`);
      console.log(`    Temp: ${p.temperature}, Humidity: ${p.humidity}`);
      console.log(`    Image ID: ${p.image_id || 'NULL'}`);
      console.log(`    Captured: ${p.captured_at}`);
    });
  }

  // 6. Summary and recommendations
  console.log('\n');
  console.log('=' .repeat(80));
  console.log('DIAGNOSTIC SUMMARY & RECOMMENDATIONS');
  console.log('=' .repeat(80));

  const issues = [];
  const fixes = [];

  if (!snapshots || snapshots.length === 0) {
    issues.push('❌ No session_wake_snapshots found');
    fixes.push('Run snapshot generation/backfill script');
  }

  if (rpcData && (!rpcData.devices || rpcData.devices.length === 0)) {
    issues.push('❌ RPC returns empty devices array');
    fixes.push('Check device_site_assignments for this session date');
  }

  if (rpcData && rpcData.devices && rpcData.devices[0] &&
      (!rpcData.devices[0].images || rpcData.devices[0].images.length === 0)) {
    issues.push('❌ RPC devices have no images array');
    fixes.push('Fix image JOIN in get_session_devices_with_wakes RPC');
  }

  if ((!images || images.length === 0) && (!wakePayloads || wakePayloads.length === 0)) {
    issues.push('❌ No raw data: both images and wake_payloads tables are empty');
    fixes.push('Verify MQTT handler is writing data correctly');
  }

  if (issues.length === 0) {
    console.log('\n✅ All data looks good! Issue may be in frontend processing.');
    console.log('   Next steps:');
    console.log('   1. Add console.log in SiteDeviceSessionDetailPage.tsx');
    console.log('   2. Check processedSnapshots useMemo output');
    console.log('   3. Verify chart component receives data prop');
  } else {
    console.log('\n⚠️  Issues found:');
    issues.forEach(issue => console.log(`   ${issue}`));
    console.log('\n🔧 Recommended fixes:');
    fixes.forEach((fix, i) => console.log(`   ${i + 1}. ${fix}`));
  }

  console.log('\n');
}

// Main execution
async function main() {
  const sessionId = await findRecentSession();
  if (sessionId) {
    await diagnoseSession(sessionId);
  }
}

main().catch(console.error);
