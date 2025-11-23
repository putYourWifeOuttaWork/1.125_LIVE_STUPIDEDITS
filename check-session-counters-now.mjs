#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkCounters() {
  console.log('=== Checking Session Counters After Backfill ===\n');

  // Get the session from the screenshot (Nov 21, 2025 at IoT Test Site 2)
  const { data: sessions, error } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, expected_wake_count, completed_wake_count, failed_wake_count, extra_wake_count, sites(name)')
    .gte('session_date', '2025-11-21')
    .order('session_date', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Recent Sessions:');
  sessions?.forEach(s => {
    console.log(`\nSession Date: ${s.session_date}`);
    console.log(`Site: ${s.sites?.name || 'Unknown'}`);
    console.log(`Expected: ${s.expected_wake_count}`);
    console.log(`Completed: ${s.completed_wake_count} ⬅️ Should be > 0 now`);
    console.log(`Failed: ${s.failed_wake_count}`);
    console.log(`Extra: ${s.extra_wake_count}`);

    // Count actual payloads for this session
    supabase
      .from('device_wake_payloads')
      .select('payload_status, overage_flag')
      .eq('site_device_session_id', s.session_id)
      .then(({ data: payloads }) => {
        const completed = payloads?.filter(p => p.payload_status === 'complete' && !p.overage_flag).length || 0;
        console.log(`Actual payloads (complete, not overage): ${completed}`);
      });
  });

  // Wait for the async queries
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n=== Issue Identified ===');
  console.log('If counters still show 0, the triggers may not be firing on UPDATE.');
  console.log('The triggers likely only fire on INSERT, not when we backfill existing rows.');
  console.log('\nWe need to manually update the counters OR recreate the triggers.');
}

checkCounters().then(() => setTimeout(() => process.exit(0), 2000)).catch(console.error);
