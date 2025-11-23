#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function findSessionsWithPayloads() {
  console.log('=== Finding Sessions with Actual Payloads ===\n');

  // Get all payloads with their session info
  const { data: payloads } = await supabase
    .from('device_wake_payloads')
    .select('site_device_session_id, captured_at, payload_status')
    .order('captured_at', { ascending: false })
    .limit(100);

  console.log(`Total payloads in database: ${payloads?.length || 0}\n`);

  // Group by session
  const sessionMap = {};
  payloads?.forEach(p => {
    if (!sessionMap[p.site_device_session_id]) {
      sessionMap[p.site_device_session_id] = { complete: 0, pending: 0, failed: 0 };
    }
    sessionMap[p.site_device_session_id][p.payload_status]++;
  });

  console.log('Sessions with payloads:');
  for (const [sessionId, counts] of Object.entries(sessionMap)) {
    // Get session details
    const { data: session } = await supabase
      .from('site_device_sessions')
      .select('session_date, expected_wake_count, completed_wake_count, sites(name)')
      .eq('session_id', sessionId)
      .single();

    if (session) {
      const total = counts.complete + counts.pending + counts.failed;
      console.log(`\n${session.sites?.name} - ${session.session_date}`);
      console.log(`  Expected: ${session.expected_wake_count}`);
      console.log(`  Actual payloads: ${total} (${counts.complete} complete, ${counts.pending} pending, ${counts.failed} failed)`);
      console.log(`  Stored counter: ${session.completed_wake_count} ⬅️ Should match ${counts.complete}`);
      
      if (session.completed_wake_count !== counts.complete) {
        console.log(`  ⚠️  MISMATCH! Needs update.`);
      }
    }
  }
}

findSessionsWithPayloads().then(() => setTimeout(() => process.exit(0), 2000)).catch(console.error);
