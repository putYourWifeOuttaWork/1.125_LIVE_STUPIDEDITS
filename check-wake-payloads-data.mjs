import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkData() {
  console.log('\n=== Checking Session Wake Payload Linkage ===\n');

  // Get a recent session
  const { data: sessions, error: sessErr } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, status, expected_wake_count, completed_wake_count')
    .eq('session_date', '2025-11-23')
    .order('session_date', { ascending: false })
    .limit(1);

  if (sessErr) {
    console.error('Error fetching session:', sessErr);
    return;
  }

  if (!sessions || sessions.length === 0) {
    console.log('No sessions found for 2025-11-23');
    return;
  }

  const session = sessions[0];
  console.log('📅 Session:', {
    session_id: session.session_id,
    date: session.session_date,
    status: session.status,
    expected: session.expected_wake_count,
    completed: session.completed_wake_count
  });

  // Check wake_payloads for this session
  const { data: wakes, error: wakeErr } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, site_device_session_id, payload_status, overage_flag, captured_at')
    .eq('site_device_session_id', session.session_id);

  if (wakeErr) {
    console.error('Error fetching wakes:', wakeErr);
    return;
  }

  console.log('\n🔍 Wake Payloads for this session:', wakes?.length || 0);
  
  if (wakes && wakes.length > 0) {
    console.log('\nWake details:');
    wakes.forEach(w => {
      console.log(`  - ${w.payload_id.substring(0, 8)}... status: ${w.payload_status}, overage: ${w.overage_flag}, time: ${w.captured_at}`);
    });

    // Count by status
    const complete = wakes.filter(w => w.payload_status === 'complete').length;
    const failed = wakes.filter(w => w.payload_status === 'failed').length;
    const pending = wakes.filter(w => w.payload_status === 'pending').length;
    const overage = wakes.filter(w => w.overage_flag === true).length;

    console.log('\n📊 Status breakdown:');
    console.log(`  Complete: ${complete}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Pending: ${pending}`);
    console.log(`  Overage: ${overage}`);
  } else {
    console.log('\n⚠️  NO WAKE PAYLOADS LINKED TO THIS SESSION!');
    
    // Check if there are ANY wake payloads today
    const { data: anyWakes, error: anyErr } = await supabase
      .from('device_wake_payloads')
      .select('payload_id, site_device_session_id, payload_status, captured_at')
      .gte('captured_at', '2025-11-23T00:00:00Z')
      .lt('captured_at', '2025-11-24T00:00:00Z')
      .limit(10);

    if (anyErr) {
      console.error('Error checking any wakes:', anyErr);
      return;
    }

    console.log(`\n🔍 Found ${anyWakes?.length || 0} wake payloads today in total`);
    
    if (anyWakes && anyWakes.length > 0) {
      console.log('\nThese wakes have session IDs:');
      anyWakes.forEach(w => {
        console.log(`  - Payload: ${w.payload_id.substring(0, 8)}... → Session: ${w.site_device_session_id ? w.site_device_session_id.substring(0, 8) + '...' : 'NULL'}`);
      });
    }
  }
}

checkData();
