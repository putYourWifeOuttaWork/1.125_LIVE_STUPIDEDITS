import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🧪 Direct Function Test\n');

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

console.log(`✅ Found session: ${session.session_id}`);

// Try to call the function directly
console.log('\n📞 Calling generate_session_wake_snapshot...');

const { data, error } = await supabase.rpc('generate_session_wake_snapshot', {
  p_session_id: session.session_id,
  p_wake_number: 99,
  p_wake_round_start: new Date('2025-11-20T10:00:00Z').toISOString(),
  p_wake_round_end: new Date('2025-11-20T12:00:00Z').toISOString()
});

if (error) {
  console.log('❌ Error:', error.message);
  console.log('\nFull error:', JSON.stringify(error, null, 2));
} else {
  console.log('✅ Success! Snapshot ID:', data);
}
