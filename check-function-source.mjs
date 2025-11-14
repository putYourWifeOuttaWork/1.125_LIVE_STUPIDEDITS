import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log('Checking fn_get_or_create_device_submission function source...\n');

const { data, error } = await supabase.rpc('exec_sql', {
  query: `
    SELECT pg_get_functiondef(oid) as function_def
    FROM pg_proc
    WHERE proname = 'fn_get_or_create_device_submission'
  `
});

if (error) {
  console.log('Error:', error);

  // Alternative approach
  const { data: altData, error: altError } = await supabase
    .from('pg_proc')
    .select('*')
    .eq('proname', 'fn_get_or_create_device_submission');

  console.log('Alt approach:', altData, altError);
} else {
  console.log('Function definition:');
  console.log(data);
}

process.exit(0);
