import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const { data, error } = await supabase
  .from('device_history')
  .select('history_id, session_id')
  .limit(1);

if (error) {
  console.log('Error:', error.message);
} else {
  console.log('device_history has session_id column:', data !== null);
  console.log('Sample data:', data);
}

// Check what table session_id references
console.log('\nSchema says device_history.session_id should reference device_wake_sessions');
console.log('Migration tried to add it referencing device_sessions');
console.log('\nThis might have caused a conflict or the ADD COLUMN was skipped if it existed');
