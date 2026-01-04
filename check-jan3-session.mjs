#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkJan3Session() {
  console.log('🔍 Checking January 3, 2026 session...\n');

  // Find session for Jan 3
  const { data: sessions, error: sessError } = await supabase
    .from('site_device_sessions')
    .select('session_id, site_id, session_date, session_start_time, session_end_time, completed_wake_count')
    .eq('session_date', '2026-01-03')
    .order('created_at', { ascending: false });

  if (sessError || !sessions || sessions.length === 0) {
    console.error('❌ No sessions found for Jan 3:', sessError);
    return;
  }

  console.log(`Found ${sessions.length} sessions for Jan 3, 2026:\n`);
  sessions.forEach((s, i) => {
    console.log(`${i + 1}. Session ID: ${s.session_id}`);
    console.log(`   Site ID: ${s.site_id}`);
    console.log(`   Completed wakes: ${s.completed_wake_count}`);
    console.log('');
  });

  // Use first session
  const sessionId = sessions[0].session_id;
  const siteId = sessions[0].site_id;

  // Check snapshots for this session
  console.log(`📸 Checking snapshots for session: ${sessionId}\n`);

  const { data: snapshots, error: snapError } = await supabase
    .from('session_wake_snapshots')
    .select('snapshot_id, session_id, wake_number, wake_round_start, avg_temperature, avg_humidity, new_images_this_round')
    .eq('session_id', sessionId)
    .order('wake_number');

  if (snapError) {
    console.error('❌ Error fetching snapshots:', snapError);
  } else if (!snapshots || snapshots.length === 0) {
    console.log('⚠️  NO SNAPSHOTS found for this session!');
    console.log('   This is why the map and analytics are blank.\n');

    // Check if there are ANY snapshots for this site
    const { data: siteSnapshots } = await supabase
      .from('session_wake_snapshots')
      .select('snapshot_id, session_id, wake_number, site_id')
      .eq('site_id', siteId)
      .limit(10);

    if (siteSnapshots && siteSnapshots.length > 0) {
      console.log(`   BUT there ARE ${siteSnapshots.length} snapshots for this site:`);
      siteSnapshots.forEach(s => {
        console.log(`     Session: ${s.session_id}, Wake #${s.wake_number}`);
      });
      console.log('\n   → Snapshots exist but for DIFFERENT sessions!\n');
    }
  } else {
    console.log(`✅ Found ${snapshots.length} snapshots for this session\n`);
    snapshots.forEach(s => {
      console.log(`Wake #${s.wake_number}:`);
      console.log(`  Temp: ${s.avg_temperature || 'null'}, Humidity: ${s.avg_humidity || 'null'}`);
      console.log(`  Images: ${s.new_images_this_round || 0}`);
    });
  }

  // Check wake payloads
  console.log(`\n📡 Checking wake payloads for session: ${sessionId}\n`);

  const { data: payloads } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, device_id, captured_at, temperature, humidity, image_id')
    .eq('site_device_session_id', sessionId)
    .order('captured_at')
    .limit(5);

  if (!payloads || payloads.length === 0) {
    console.log('⚠️  NO WAKE PAYLOADS for this session\n');
  } else {
    console.log(`✅ Found ${payloads.length} wake payloads (showing first 5):\n`);
    payloads.forEach((p, i) => {
      console.log(`${i + 1}. ${p.captured_at}`);
      console.log(`   Temp: ${p.temperature}, Humidity: ${p.humidity}, Image: ${p.image_id ? 'YES' : 'NO'}`);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDATION');
  console.log('='.repeat(80));
  console.log('\nRun these scripts for Jan 3 session:');
  console.log(`1. node backfill-wake-payload-data.mjs (update to use session: ${sessionId})`);
  console.log(`2. node regenerate-session-snapshots.mjs (update to use session: ${sessionId})`);
  console.log('\n');
}

checkJan3Session().catch(console.error);
