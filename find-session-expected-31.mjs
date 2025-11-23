#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function findSession() {
  console.log('=== Finding Session with Expected=31 ===\n');

  const { data: sessions } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, expected_wake_count, completed_wake_count, failed_wake_count, extra_wake_count, sites(name)')
    .eq('expected_wake_count', 31)
    .order('session_date', { ascending: false })
    .limit(5);

  console.log(`Sessions with expected_wake_count = 31:\n`);

  for (const s of sessions || []) {
    console.log(`Site: ${s.sites?.name}`);
    console.log(`Date: ${s.session_date}`);
    console.log(`Session ID: ${s.session_id}`);
    console.log(`Expected: ${s.expected_wake_count}`);
    console.log(`Completed (stored): ${s.completed_wake_count}`);
    console.log(`Failed (stored): ${s.failed_wake_count}`);
    console.log(`Extra (stored): ${s.extra_wake_count}`);

    // Check actual payloads
    const { data: payloads } = await supabase
      .from('device_wake_payloads')
      .select('payload_status, overage_flag')
      .eq('site_device_session_id', s.session_id);

    if (payloads && payloads.length > 0) {
      const stats = {
        complete_not_overage: payloads.filter(p => p.payload_status === 'complete' && !p.overage_flag).length,
        complete_overage: payloads.filter(p => p.payload_status === 'complete' && p.overage_flag).length,
        failed: payloads.filter(p => p.payload_status === 'failed').length,
      };
      console.log(`\nActual payloads:`);
      console.log(`  Total: ${payloads.length}`);
      console.log(`  Complete (not overage): ${stats.complete_not_overage} ⬅️ Should be "Completed"`);
      console.log(`  Complete (overage): ${stats.complete_overage} ⬅️ Should be "Extra"`);
      console.log(`  Failed: ${stats.failed}`);
    } else {
      console.log(`\n❌ NO PAYLOADS for this session!`);
    }
    console.log('\n---\n');
  }
}

findSession().then(() => process.exit(0)).catch(console.error);
