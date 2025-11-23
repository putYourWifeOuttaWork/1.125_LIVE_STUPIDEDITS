import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkData() {
  console.log('\n=== Checking Session Wake Payload Linkage ===\n');

  const { data: sessions } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, status, expected_wake_count, completed_wake_count')
    .eq('session_date', '2025-11-23')
    .order('session_date', { ascending: false })
    .limit(1);

  if (!sessions || sessions.length === 0) {
    console.log('No sessions found');
    return;
  }

  const session = sessions[0];
  console.log('Session:', session);

  const { data: wakes } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, site_device_session_id, payload_status, overage_flag')
    .eq('site_device_session_id', session.session_id);

  console.log('\nWake Payloads linked to this session:', wakes?.length || 0);

  if (!wakes || wakes.length === 0) {
    console.log('\nNO WAKES LINKED! Checking all wakes today...');

    const { data: anyWakes } = await supabase
      .from('device_wake_payloads')
      .select('payload_id, site_device_session_id, payload_status')
      .gte('captured_at', '2025-11-23T00:00:00Z')
      .limit(10);

    console.log('Total wakes today:', anyWakes?.length || 0);
    if (anyWakes && anyWakes.length > 0) {
      anyWakes.forEach(w => {
        console.log('  -', w.site_device_session_id ? 'HAS SESSION' : 'NO SESSION', w.payload_status);
      });
    }
  } else {
    const complete = wakes.filter(w => w.payload_status === 'complete').length;
    const failed = wakes.filter(w => w.payload_status === 'failed').length;
    const pending = wakes.filter(w => w.payload_status === 'pending').length;
    console.log('\nComplete:', complete, 'Failed:', failed, 'Pending:', pending);
  }
}

checkData();
