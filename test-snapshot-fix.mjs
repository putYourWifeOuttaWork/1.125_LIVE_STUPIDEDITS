import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Testing snapshot generation...\n');

const { data, error } = await supabase.rpc('generate_session_wake_snapshot', {
  p_session_id: '3db2ce6a-a0d0-4da0-a4dd-c418dca64bd4',
  p_wake_number: 1,
  p_wake_round_start: '2025-11-21T14:00:00Z',
  p_wake_round_end: '2025-11-21T15:00:00Z'
});

if (error) {
  console.error('❌ Error:', error.message);
  console.error('Details:', error.details);
  console.error('Hint:', error.hint);
} else {
  console.log('✅ Success! Snapshot ID:', data);
}
