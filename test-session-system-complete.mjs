#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('🧪 Testing Complete Session System\n');
console.log('='.repeat(60));

async function main() {
  let allPassed = true;

  // TEST 1: Check expired sessions function exists
  console.log('\n📋 TEST 1: Check expired sessions diagnostic');
  const { data: expiredCheck, error: expiredError } = await supabase.rpc('check_expired_sessions');

  if (expiredError) {
    console.log('❌ FAIL:', expiredError.message);
    allPassed = false;
  } else {
    console.log('✅ PASS: Function exists');
    console.log(`   Expired submission sessions: ${expiredCheck.expired_submission_sessions}`);
    console.log(`   Expired device sessions: ${expiredCheck.expired_device_sessions}`);
    console.log(`   Total expired: ${expiredCheck.total_expired}`);
  }

  // TEST 2: Check unified sessions function exists
  console.log('\n📋 TEST 2: Unified sessions query');
  const { data: unifiedSessions, error: unifiedError } = await supabase.rpc('get_my_active_sessions_unified');

  if (unifiedError) {
    console.log('❌ FAIL:', unifiedError.message);
    allPassed = false;
  } else {
    console.log('✅ PASS: Function exists');
    console.log(`   Total active sessions: ${unifiedSessions.length}`);

    const byType = {
      human: unifiedSessions.filter(s => s.session_type === 'human').length,
      device: unifiedSessions.filter(s => s.session_type === 'device').length
    };

    console.log(`   Human sessions: ${byType.human}`);
    console.log(`   Device sessions: ${byType.device}`);

    if (unifiedSessions.length > 0) {
      const sample = unifiedSessions[0];
      console.log('\n   Sample session:');
      console.log(`     Type: ${sample.session_type}`);
      console.log(`     Site: ${sample.site_name}`);
      console.log(`     Program: ${sample.program_name}`);
      console.log(`     Status: ${sample.status}`);
      console.log(`     Progress: ${sample.completed_items}/${sample.expected_items} (${Math.round(sample.progress_percent)}%)`);
    }
  }

  // TEST 3: Check device sessions table
  console.log('\n📋 TEST 3: Device sessions table');
  const { data: deviceSessions, error: deviceError } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, status, expected_wake_count, completed_wake_count')
    .order('session_date', { ascending: false })
    .limit(5);

  if (deviceError) {
    console.log('❌ FAIL:', deviceError.message);
    allPassed = false;
  } else {
    console.log('✅ PASS: Table accessible');
    console.log(`   Total recent sessions: ${deviceSessions.length}`);

    if (deviceSessions.length > 0) {
      console.log('\n   Recent device sessions:');
      deviceSessions.forEach(s => {
        console.log(`     ${s.session_date} | ${s.status} | ${s.completed_wake_count}/${s.expected_wake_count} wakes`);
      });
    }
  }

  // TEST 4: Check session creation log
  console.log('\n📋 TEST 4: Session creation log');
  const { data: creationLog, error: logError } = await supabase
    .from('session_creation_log')
    .select('*')
    .order('execution_time', { ascending: false })
    .limit(3);

  if (logError) {
    console.log('❌ FAIL:', logError.message);
    allPassed = false;
  } else {
    console.log('✅ PASS: Log accessible');
    console.log(`   Total log entries: ${creationLog.length}`);

    if (creationLog.length > 0) {
      const latest = creationLog[0];
      console.log('\n   Latest execution:');
      console.log(`     Time: ${new Date(latest.execution_time).toLocaleString()}`);
      console.log(`     Sites processed: ${latest.total_sites}`);
      console.log(`     Successes: ${latest.success_count}`);
      console.log(`     Errors: ${latest.error_count}`);
      console.log(`     Duration: ${latest.execution_duration_ms}ms`);
    }
  }

  // TEST 5: Check devices with active assignments
  console.log('\n📋 TEST 5: Devices with active site assignments');
  const { data: devices, error: devicesError } = await supabase
    .from('devices')
    .select(`
      device_id,
      device_name,
      device_mac,
      is_active,
      site_id,
      sites(name)
    `)
    .eq('is_active', true)
    .not('site_id', 'is', null)
    .limit(5);

  if (devicesError) {
    console.log('❌ FAIL:', devicesError.message);
    allPassed = false;
  } else {
    console.log('✅ PASS: Devices found');
    console.log(`   Active devices with sites: ${devices.length}`);

    if (devices.length > 0) {
      console.log('\n   Sample devices:');
      devices.forEach(d => {
        console.log(`     ${d.device_name || d.device_mac} → ${d.sites?.name || 'Unknown site'}`);
      });
    }
  }

  // FINAL SUMMARY
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED');
    console.log('\n🎯 Next Steps:');
    console.log('   1. Schedule cron job at cron-job.org');
    console.log('   2. Test UI Sessions drawer');
    console.log('   3. Wait for midnight to verify auto-execution');
  } else {
    console.log('❌ SOME TESTS FAILED');
    console.log('   Review errors above and fix issues');
  }
  console.log('='.repeat(60));
}

main().catch(console.error);
