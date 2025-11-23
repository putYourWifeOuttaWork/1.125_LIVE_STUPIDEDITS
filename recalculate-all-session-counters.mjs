#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function recalculateAllSessionCounters() {
  console.log('=== Recalculating All Session Counters ===\n');

  // Get all sessions
  const { data: sessions, error: sessionsError } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, sites(name)');

  if (sessionsError) {
    console.error('Error fetching sessions:', sessionsError);
    return;
  }

  console.log(`Found ${sessions.length} sessions to recalculate\n`);

  let updated = 0;
  let skipped = 0;

  for (const session of sessions) {
    // Get actual payload counts
    const { data: payloads } = await supabase
      .from('device_wake_payloads')
      .select('payload_status, overage_flag')
      .eq('site_device_session_id', session.session_id);

    if (!payloads || payloads.length === 0) {
      skipped++;
      continue;
    }

    const completed_wake_count = payloads.filter(
      p => p.payload_status === 'complete' && p.overage_flag === false
    ).length;

    const failed_wake_count = payloads.filter(
      p => p.payload_status === 'failed'
    ).length;

    const extra_wake_count = payloads.filter(
      p => p.overage_flag === true
    ).length;

    // Update the session
    const { error: updateError } = await supabase
      .from('site_device_sessions')
      .update({
        completed_wake_count,
        failed_wake_count,
        extra_wake_count
      })
      .eq('session_id', session.session_id);

    if (updateError) {
      console.error(`Error updating session ${session.session_id}:`, updateError);
    } else {
      console.log(`✅ ${session.sites?.name} (${session.session_date}): ${completed_wake_count} completed, ${failed_wake_count} failed, ${extra_wake_count} extra`);
      updated++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated} sessions`);
  console.log(`Skipped: ${skipped} sessions (no payloads)`);
  console.log('\n✅ All session counters recalculated from actual payload data!');
}

recalculateAllSessionCounters().then(() => process.exit(0)).catch(console.error);
