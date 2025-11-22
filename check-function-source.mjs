import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking function source code in database...\n');

const { data, error } = await supabase
  .from('pg_proc')
  .select('proname, prosrc')
  .eq('proname', 'generate_session_wake_snapshot');

if (error) {
  console.log('Using RPC instead...');
  
  // Try direct SQL query
  const { data: result, error: sqlError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        p.proname,
        pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'generate_session_wake_snapshot'
        AND n.nspname = 'public'
    `
  });
  
  if (sqlError) {
    console.log('Cannot query pg_proc. Trying alternative...\n');
    
    // Check what functions exist
    const { data: funcs, error: e } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT routine_name, routine_type
        FROM information_schema.routines
        WHERE routine_name LIKE '%snapshot%'
          AND routine_schema = 'public'
        ORDER BY routine_name
      `
    });
    
    console.log('Functions with "snapshot" in name:', funcs);
  } else {
    console.log('Function definition:', result);
  }
} else {
  console.log('Found functions:', data);
}
