#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseSession() {
  console.log('=== Diagnosing Nov 21 Session ===\n');

  // Get the session
  const { data: session } = await supabase
    .from('site_device_sessions')
    .select('session_id, site_id, session_date, expected_wake_count, sites(name)')
    .eq('session_date', '2025-11-21')
    .eq('expected_wake_count', 37)
    .single();

  console.log(`Session ID: ${session.session_id}`);
  console.log(`Site: ${session.sites?.name}`);
  console.log(`Expected: ${session.expected_wake_count} wakes\n`);

  // Get ALL payloads for this session (any status)
  const { data: allPayloads } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, payload_status, captured_at, site_device_session_id, device_id')
    .eq('site_device_session_id', session.session_id);

  console.log(`Payloads linked to this session: ${allPayloads?.length || 0}`);

  if (allPayloads && allPayloads.length > 0) {
    console.log('Status breakdown:');
    const statuses = {};
    allPayloads.forEach(p => {
      statuses[p.payload_status] = (statuses[p.payload_status] || 0) + 1;
    });
    console.log(statuses);
  }

  // Maybe payloads exist but aren't linked to this session?
  // Check payloads for this site on this date
  const { data: sitePayloads } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, payload_status, captured_at, site_device_session_id, site_id')
    .eq('site_id', session.site_id)
    .gte('captured_at', '2025-11-21T00:00:00Z')
    .lt('captured_at', '2025-11-22T00:00:00Z');

  console.log(`\nPayloads for this site on Nov 21: ${sitePayloads?.length || 0}`);

  if (sitePayloads && sitePayloads.length > 0) {
    console.log('Session linkage:');
    const linked = sitePayloads.filter(p => p.site_device_session_id === session.session_id).length;
    const unlinked = sitePayloads.filter(p => p.site_device_session_id !== session.session_id).length;
    console.log(`  Linked to this session: ${linked}`);
    console.log(`  Linked to OTHER sessions: ${unlinked}`);
    
    if (unlinked > 0) {
      console.log('\n⚠️  Payloads exist but are linked to different sessions!');
      const otherSessions = {};
      sitePayloads.forEach(p => {
        if (p.site_device_session_id !== session.session_id) {
          otherSessions[p.site_device_session_id] = (otherSessions[p.site_device_session_id] || 0) + 1;
        }
      });
      console.log('Other session IDs:', Object.keys(otherSessions));
    }
  }

  // Check if there are Nov 21 2025 payloads AT ALL
  const { data: allNov21, count } = await supabase
    .from('device_wake_payloads')
    .select('payload_id', { count: 'exact' })
    .gte('captured_at', '2025-11-21T00:00:00Z')
    .lt('captured_at', '2025-11-22T00:00:00Z');

  console.log(`\nTotal payloads in database for Nov 21: ${count || 0}`);
}

diagnoseSession().then(() => process.exit(0)).catch(console.error);
