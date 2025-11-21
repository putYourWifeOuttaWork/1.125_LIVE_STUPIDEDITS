#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  console.log('🔍 DIAGNOSING SNAPSHOT DATA ARCHITECTURE\n');
  console.log('=' .repeat(80));

  // 1. Check if device_wake_sessions table exists
  console.log('\n1️⃣ Checking device_wake_sessions table...\n');

  const { data: wakeSessionsCheck, error: wsError } = await supabase
    .from('device_wake_sessions')
    .select('*')
    .limit(1);

  if (wsError) {
    console.log('❌ device_wake_sessions table does NOT exist!');
    console.log(`   Error: ${wsError.message}`);
    console.log('\n🚨 THIS IS THE PROBLEM!');
    console.log('   The architecture requires device_wake_sessions to aggregate:');
    console.log('   - Telemetry payloads per wake');
    console.log('   - Images per wake');
    console.log('   - MGI scores per wake');
  } else {
    console.log('✅ device_wake_sessions table exists!');

    // Count records
    const { count } = await supabase
      .from('device_wake_sessions')
      .select('*', { count: 'exact', head: true });

    console.log(`   Total records: ${count || 0}`);

    if (count === 0) {
      console.log('\n⚠️  Table exists but has NO DATA!');
      console.log('   Devices are not creating wake sessions.');
    } else {
      // Show sample data
      const { data: samples } = await supabase
        .from('device_wake_sessions')
        .select('*')
        .limit(5)
        .order('created_at', { ascending: false });

      console.log('\n📊 Sample device_wake_sessions:');
      samples?.forEach(s => {
        console.log(`   - Device: ${s.device_id?.substring(0, 8)}...`);
        console.log(`     Wake #${s.wake_number}, Images: ${s.image_count || 0}, Has telemetry: ${!!s.telemetry_payload}`);
      });
    }
  }

  // 2. Check IoT Test Site 2
  console.log('\n' + '='.repeat(80));
  console.log('\n2️⃣ Checking "IoT Test Site 2" data...\n');

  const { data: site2 } = await supabase
    .from('sites')
    .select('*')
    .ilike('name', '%IoT Test Site 2%')
    .single();

  if (!site2) {
    console.log('❌ IoT Test Site 2 not found!');
    return;
  }

  console.log(`✅ Found: ${site2.name} (${site2.site_id})`);

  // Get active session
  const { data: session } = await supabase
    .from('site_sessions')
    .select('*')
    .eq('site_id', site2.site_id)
    .eq('status', 'active')
    .single();

  if (!session) {
    console.log('❌ No active session found!');
    return;
  }

  console.log(`✅ Active session: ${session.session_id}`);
  console.log(`   Date range: ${session.session_start_date} to ${session.session_end_date}`);

  // 3. Check for device_wake_sessions for this site
  if (!wsError) {
    console.log('\n3️⃣ Checking device_wake_sessions for this site...\n');

    const { data: deviceWakeSessions, count: dwsCount } = await supabase
      .from('device_wake_sessions')
      .select('*', { count: 'exact' })
      .eq('site_id', site2.site_id)
      .eq('session_id', session.session_id);

    console.log(`   Total device_wake_sessions: ${dwsCount || 0}`);

    if (dwsCount > 0) {
      // Check for ones with data
      const withImages = deviceWakeSessions.filter(d => d.image_count > 0).length;
      const withTelemetry = deviceWakeSessions.filter(d => d.telemetry_payload).length;
      const withMGI = deviceWakeSessions.filter(d => d.mgi_score != null).length;

      console.log(`   - With images: ${withImages}`);
      console.log(`   - With telemetry: ${withTelemetry}`);
      console.log(`   - With MGI: ${withMGI}`);

      if (withImages === 0 && withTelemetry === 0) {
        console.log('\n⚠️  device_wake_sessions exist but have NO DATA!');
      }
    }
  }

  // 4. Check session_wake_snapshots
  console.log('\n' + '='.repeat(80));
  console.log('\n4️⃣ Checking session_wake_snapshots...\n');

  const { data: snapshots, count: snapshotCount } = await supabase
    .from('session_wake_snapshots')
    .select('*', { count: 'exact' })
    .eq('site_id', site2.site_id)
    .eq('session_id', session.session_id);

  console.log(`   Total snapshots: ${snapshotCount || 0}`);

  if (snapshotCount > 0) {
    const withImages = snapshots.filter(s => s.new_images_this_round > 0).length;
    const withTemp = snapshots.filter(s => s.avg_temperature != null).length;
    const withMGI = snapshots.filter(s => s.avg_mgi != null).length;

    console.log(`   - With new_images > 0: ${withImages}`);
    console.log(`   - With avg_temperature: ${withTemp}`);
    console.log(`   - With avg_mgi: ${withMGI}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📋 SUMMARY\n');
  console.log('The snapshot generation should:');
  console.log('1. Query device_wake_sessions (the aggregation table)');
  console.log('2. Roll up image_count, telemetry_payload, and mgi_score');
  console.log('3. Calculate averages across all devices for that wake');
  console.log('\nThis matches the green highlighted area in your ERD!');
}

diagnose().then(() => process.exit(0));
