import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Diagnosing snapshot generation issue\n');

// Get a session with actual data
const { data: session } = await supabase
  .from('site_device_sessions')
  .select(`
    *,
    sites (site_id, site_name),
    pilot_programs (program_id, name, start_date, end_date)
  `)
  .eq('status', 'in_progress')
  .limit(1)
  .single();

if (!session) {
  console.log('❌ No active session found');
  process.exit(1);
}

console.log('Session:', session.session_id);
console.log('Site:', session.sites?.site_name);
console.log('Program:', session.pilot_programs?.name);
console.log('Program dates:', session.pilot_programs?.start_date, 'to', session.pilot_programs?.end_date);

// Test date arithmetic directly
const wakeEnd = new Date('2025-11-21T12:00:00Z');
const programStart = new Date(session.pilot_programs.start_date);
const programEnd = new Date(session.pilot_programs.end_date);

console.log('\n📅 Date calculations (JavaScript):');
console.log('  Wake end:', wakeEnd.toISOString());
console.log('  Program start:', programStart.toISOString());
console.log('  Program end:', programEnd.toISOString());
console.log('  Days since start:', Math.floor((wakeEnd - programStart) / 86400000));
console.log('  Total program days:', Math.floor((programEnd - programStart) / 86400000));

// Try a minimal test
console.log('\n🧪 Testing minimal program_day calculation...');

const { data: testResult, error: testError } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT 
      pp.start_date,
      pp.end_date,
      (EXTRACT(EPOCH FROM (TIMESTAMP '2025-11-21 12:00:00+00' - pp.start_date)) / 86400.0)::integer as program_day_calc,
      (EXTRACT(EPOCH FROM (pp.end_date - pp.start_date)) / 86400.0)::integer as total_days_calc
    FROM pilot_programs pp
    WHERE pp.program_id = '${session.pilot_programs.program_id}'
  `
});

if (testError) {
  console.log('❌ SQL Error:', testError.message);
} else {
  console.log('✅ Direct SQL calculation:', testResult);
}

// Now try calling the actual function
console.log('\n🎯 Calling generate_session_wake_snapshot...');

const { data: snapshotId, error: snapError } = await supabase.rpc('generate_session_wake_snapshot', {
  p_session_id: session.session_id,
  p_wake_number: 999,
  p_wake_round_start: '2025-11-21T10:00:00Z',
  p_wake_round_end: '2025-11-21T12:00:00Z'
});

if (snapError) {
  console.log('❌ Function Error:', snapError.message);
  console.log('   Hint:', snapError.hint || 'N/A');
  console.log('   Details:', snapError.details || 'N/A');
  
  // Try to parse which line
  if (snapError.message.includes('CONTEXT')) {
    console.log('\n📍 Error context:', snapError.message.split('CONTEXT:')[1]);
  }
} else {
  console.log('✅ Success! Snapshot ID:', snapshotId);
}
