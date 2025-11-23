#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  console.log('Testing if views need updating...\n');

  // Get a session with payloads
  const { data: sessions } = await supabase
    .from('site_device_sessions')
    .select('session_id')
    .limit(1);

  if (!sessions || sessions.length === 0) {
    console.log('No sessions found');
    return;
  }

  const sessionId = sessions[0].session_id;
  console.log(`Testing with session: ${sessionId}\n`);

  // Get actual counts from payloads
  const { data: payloads } = await supabase
    .from('device_wake_payloads')
    .select('payload_status, overage_flag')
    .eq('site_device_session_id', sessionId);

  const actualComplete = payloads?.filter(p => p.payload_status === 'complete' && !p.overage_flag).length || 0;
  const actualFailed = payloads?.filter(p => p.payload_status === 'failed').length || 0;
  const actualExtra = payloads?.filter(p => p.overage_flag).length || 0;

  console.log('Actual counts from device_wake_payloads:');
  console.log(`  Complete: ${actualComplete}`);
  console.log(`  Failed: ${actualFailed}`);
  console.log(`  Extra: ${actualExtra}\n`);

  // Try querying the view
  const { data: viewData, error } = await supabase
    .from('vw_site_day_sessions')
    .select('completed_wake_count, failed_wake_count, extra_wake_count, total_wakes')
    .eq('session_id', sessionId)
    .single();

  if (error) {
    console.log('Error querying view (might not have total_wakes column yet):', error.message);
    console.log('\nThe migration needs to be applied to Supabase.');
    console.log('Migration file created at: supabase/migrations/20251123150000_fix_session_views_dynamic_counts.sql');
    return;
  }

  console.log('View counts:');
  console.log(`  Complete: ${viewData.completed_wake_count}`);
  console.log(`  Failed: ${viewData.failed_wake_count}`);
  console.log(`  Extra: ${viewData.extra_wake_count}`);
  console.log(`  Total: ${viewData.total_wakes || 'N/A'}\n`);

  const isAligned = 
    viewData.completed_wake_count === actualComplete &&
    viewData.failed_wake_count === actualFailed &&
    viewData.extra_wake_count === actualExtra;

  if (isAligned && viewData.total_wakes !== undefined) {
    console.log('✓ Views are working correctly with dynamic counts!');
  } else if (viewData.total_wakes === undefined) {
    console.log('⚠ Migration needs to be applied (total_wakes column missing)');
  } else {
    console.log('⚠ Counts are misaligned - migration needs to be applied');
  }
}

test().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
