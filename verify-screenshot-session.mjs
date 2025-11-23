#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function verifySession() {
  console.log('=== Verifying Session from Screenshot ===\n');
  console.log('Looking for: Nov 21, 2025 at IoT Test Site 2 with 37 expected wakes\n');

  const { data: session, error } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, expected_wake_count, completed_wake_count, failed_wake_count, extra_wake_count, sites(name)')
    .eq('session_date', '2025-11-21')
    .eq('expected_wake_count', 37)
    .single();

  if (error) {
    console.error('Error:', error);
    
    // Try broader search
    console.log('\nSearching for all Nov 21 sessions...');
    const { data: allSessions } = await supabase
      .from('site_device_sessions')
      .select('session_id, session_date, expected_wake_count, completed_wake_count, sites(name)')
      .eq('session_date', '2025-11-21');
    
    console.log('Found sessions:', allSessions);
    return;
  }

  console.log('Session Found:');
  console.log(`  Site: ${session.sites?.name}`);
  console.log(`  Date: ${session.session_date}`);
  console.log(`  Expected: ${session.expected_wake_count}`);
  console.log(`  Completed: ${session.completed_wake_count} ⬅️`);
  console.log(`  Failed: ${session.failed_wake_count}`);
  console.log(`  Extra: ${session.extra_wake_count}`);

  // Count actual payloads
  const { data: payloads } = await supabase
    .from('device_wake_payloads')
    .select('payload_status, overage_flag')
    .eq('site_device_session_id', session.session_id);

  const completed = payloads?.filter(p => p.payload_status === 'complete' && !p.overage_flag).length || 0;

  console.log(`\n  Actual complete payloads: ${completed}`);

  if (session.completed_wake_count !== completed) {
    console.log('\n⚠️  Counter mismatch! Need to recalculate this specific session.');
    
    // Recalculate
    const { error: updateError } = await supabase
      .from('site_device_sessions')
      .update({ completed_wake_count: completed })
      .eq('session_id', session.session_id);
    
    if (updateError) {
      console.error('Update error:', updateError);
    } else {
      console.log(`✅ Updated session counter to ${completed}`);
    }
  } else {
    console.log('\n✅ Counter matches actual payloads!');
  }
}

verifySession().then(() => process.exit(0)).catch(console.error);
