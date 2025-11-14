import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log('Checking submission_sessions table schema...\n');

// Get a sample row to see the columns
const { data, error } = await supabase
  .from('submission_sessions')
  .select('*')
  .limit(1);

if (error) {
  console.log('Error:', error);
} else if (data && data.length > 0) {
  console.log('Columns in submission_sessions:');
  console.log(Object.keys(data[0]).join(', '));
  console.log('\nSample row:');
  console.log(JSON.stringify(data[0], null, 2));
} else {
  console.log('No rows found in submission_sessions table');
}

process.exit(0);
