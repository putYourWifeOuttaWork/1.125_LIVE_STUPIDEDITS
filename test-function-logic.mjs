import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🧪 Testing which version of function is deployed\n');

// Get a real session
const { data: session } = await supabase
  .from('site_device_sessions')
  .select('*')
  .eq('status', 'in_progress')
  .limit(1)
  .single();

if (!session) {
  console.log('❌ No active session found');
  process.exit(1);
}

console.log(`✅ Testing with session: ${session.session_id}`);

// Try calling with a test wake
const { data, error } = await supabase.rpc('generate_session_wake_snapshot', {
  p_session_id: session.session_id,
  p_wake_number: 999,
  p_wake_round_start: new Date('2025-11-21T10:00:00Z').toISOString(),
  p_wake_round_end: new Date('2025-11-21T12:00:00Z').toISOString()
});

if (error) {
  console.log('\n❌ Error:', error.message);
  
  if (error.message.includes('extract(unknown, integer)')) {
    console.log('\n🔍 Diagnosis: Function still has OLD code with DATE_PART');
    console.log('\n📋 Action Required:');
    console.log('   1. Open Supabase SQL Editor');
    console.log('   2. Run the contents of: FINAL_FIX_APPLY_NOW.sql');
    console.log('   3. Confirm you see "Success. No rows returned"');
    console.log('   4. Re-run this test');
  }
} else {
  console.log('\n✅ Success! Function is working correctly');
  console.log('   Snapshot ID:', data);
}
