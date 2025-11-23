#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function fixMismatch() {
  console.log('=== Fixing Nov 11 Session Mismatch ===\n');

  const { data: session } = await supabase
    .from('site_device_sessions')
    .select('session_id')
    .eq('session_date', '2025-11-11')
    .single();

  if (!session) {
    console.log('Session not found');
    return;
  }

  const { data: payloads } = await supabase
    .from('device_wake_payloads')
    .select('payload_status, overage_flag')
    .eq('site_device_session_id', session.session_id);

  const completed = payloads?.filter(p => p.payload_status === 'complete' && !p.overage_flag).length || 0;

  const { error } = await supabase
    .from('site_device_sessions')
    .update({ completed_wake_count: completed })
    .eq('session_id', session.session_id);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`✅ Updated Nov 11 session: completed_wake_count = ${completed}`);
  }
}

fixMismatch().then(() => process.exit(0)).catch(console.error);
