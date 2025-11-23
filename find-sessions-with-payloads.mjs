#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function findSessions() {
  console.log('=== Finding All Sessions with Payloads ===\n');

  // Get all payloads
  const { data: allPayloads } = await supabase
    .from('device_wake_payloads')
    .select('site_device_session_id, payload_status, overage_flag')
    .order('captured_at', { ascending: false });

  console.log(`Total payloads in database: ${allPayloads?.length || 0}\n`);

  // Group by session
  const sessionMap = {};
  allPayloads?.forEach(p => {
    if (!sessionMap[p.site_device_session_id]) {
      sessionMap[p.site_device_session_id] = {
        complete_not_overage: 0,
        complete_overage: 0,
        failed: 0,
        pending: 0,
        total: 0
      };
    }
    sessionMap[p.site_device_session_id].total++;
    if (p.payload_status === 'complete' && !p.overage_flag) {
      sessionMap[p.site_device_session_id].complete_not_overage++;
    }
    if (p.payload_status === 'complete' && p.overage_flag) {
      sessionMap[p.site_device_session_id].complete_overage++;
    }
    if (p.payload_status === 'failed') sessionMap[p.site_device_session_id].failed++;
    if (p.payload_status === 'pending') sessionMap[p.site_device_session_id].pending++;
  });

  console.log('Sessions with payloads:\n');

  for (const [sessionId, counts] of Object.entries(sessionMap)) {
    const { data: session } = await supabase
      .from('site_device_sessions')
      .select('session_date, expected_wake_count, completed_wake_count, sites(name)')
      .eq('session_id', sessionId)
      .single();

    if (session) {
      console.log(`${session.sites?.name || 'Unknown'} - ${session.session_date}`);
      console.log(`  Session ID: ${sessionId}`);
      console.log(`  Expected: ${session.expected_wake_count}`);
      console.log(`  Stored completed_wake_count: ${session.completed_wake_count}`);
      console.log(`  Actual payloads:`);
      console.log(`    Total: ${counts.total}`);
      console.log(`    Complete (not overage): ${counts.complete_not_overage} ⬅️ Should match UI "Completed"`);
      console.log(`    Complete (overage): ${counts.complete_overage} ⬅️ Should be UI "Extra"`);
      console.log(`    Failed: ${counts.failed}`);
      console.log(`    Pending: ${counts.pending}`);
      console.log('');

      // Now test RPC for this session
      const { data: rpcData, error } = await supabase.rpc('get_session_devices_with_wakes', {
        p_session_id: sessionId
      });

      if (!error && rpcData?.devices) {
        const rpcCompleted = rpcData.devices.reduce((sum, d) => sum + d.completed_wakes, 0);
        const rpcExtra = rpcData.devices.reduce((sum, d) => sum + d.extra_wakes, 0);
        console.log(`  RPC returns:`);
        console.log(`    Completed: ${rpcCompleted} ${rpcCompleted !== counts.complete_not_overage ? '❌ MISMATCH' : '✅'}`);
        console.log(`    Extra: ${rpcExtra} ${rpcExtra !== counts.complete_overage ? '❌ MISMATCH' : '✅'}`);
        console.log('');
      }
    }
  }
}

findSessions().then(() => process.exit(0)).catch(console.error);
