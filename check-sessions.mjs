import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking all sessions\n');

const { data: sessions, error } = await supabase
  .from('site_device_sessions')
  .select('session_id, status, session_date')
  .order('created_at', { ascending: false })
  .limit(5);

if (error) {
  console.log('❌ Error:', error.message);
} else {
  console.log('Recent sessions:', sessions);
  
  if (sessions.length > 0) {
    const testSession = sessions[0];
    console.log(`\n🧪 Testing with session: ${testSession.session_id} (${testSession.status})\n`);
    
    const { data: snapshotId, error: snapError } = await supabase.rpc('generate_session_wake_snapshot', {
      p_session_id: testSession.session_id,
      p_wake_number: 999,
      p_wake_round_start: '2025-11-21T10:00:00Z',
      p_wake_round_end: '2025-11-21T12:00:00Z'
    });

    if (snapError) {
      console.log('❌ Error:', snapError.message);
      
      // Check if it's still the extract error
      if (snapError.message.includes('extract(unknown, integer)')) {
        console.log('\n⚠️  CRITICAL: The function STILL has the old code!');
        console.log('\n📋 Please verify in Supabase SQL Editor:');
        console.log('   1. Copy ALL contents of UPDATE_FUNCTION_ONLY.sql');
        console.log('   2. Paste into SQL Editor');
        console.log('   3. Click Run');
        console.log('   4. Should see: "Function updated successfully!"');
        console.log('\nThe DROP CASCADE should force remove any cached versions.');
      }
    } else {
      console.log('✅ Success! Snapshot ID:', snapshotId);
    }
  }
}
