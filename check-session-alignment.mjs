#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkAlignment() {
  console.log('=== Checking Session Counter Alignment ===\n');

  const { data: sessions, error } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, site_id, expected_wake_count, completed_wake_count, failed_wake_count, extra_wake_count, status')
    .order('session_date', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  for (const session of sessions) {
    console.log(`\nSession Date: ${session.session_date}`);
    console.log(`  Session ID: ${session.session_id.substring(0, 12)}...`);
    console.log(`  Status: ${session.status}`);
    console.log(`  STORED in site_device_sessions:`);
    console.log(`    Expected: ${session.expected_wake_count}`);
    console.log(`    Completed: ${session.completed_wake_count}`);
    console.log(`    Failed: ${session.failed_wake_count}`);
    console.log(`    Extra: ${session.extra_wake_count}`);

    const { data: payloads, error: payloadError } = await supabase
      .from('device_wake_payloads')
      .select('payload_id, payload_status, overage_flag')
      .eq('site_device_session_id', session.session_id);

    if (payloadError) {
      console.error('  Error fetching payloads:', payloadError);
      continue;
    }

    const actualComplete = payloads.filter(p => p.payload_status === 'complete' && !p.overage_flag).length;
    const actualFailed = payloads.filter(p => p.payload_status === 'failed').length;
    const actualExtra = payloads.filter(p => p.overage_flag === true).length;
    const totalPayloads = payloads.length;

    console.log(`  ACTUAL from device_wake_payloads:`);
    console.log(`    Total Payloads: ${totalPayloads}`);
    console.log(`    Completed: ${actualComplete}`);
    console.log(`    Failed: ${actualFailed}`);
    console.log(`    Extra: ${actualExtra}`);

    const isAligned = 
      session.completed_wake_count === actualComplete &&
      session.failed_wake_count === actualFailed &&
      session.extra_wake_count === actualExtra;

    if (isAligned) {
      console.log(`  ✓ ALIGNED`);
    } else {
      console.log(`  ✗ MISALIGNED - UI needs to query payloads directly!`);
    }
  }
}

checkAlignment().then(() => process.exit(0));
