#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});

console.log('🔍 Checking get_next_wake_times function source...\n');

try {
  const { data, error } = await supabase.rpc('execute_sql', {
    sql: `
      SELECT
        proname AS function_name,
        pg_get_functiondef(oid) AS function_definition
      FROM pg_proc
      WHERE proname = 'get_next_wake_times'
    `
  });

  if (error && error.code === '42883') {
    // Try direct query
    const { data: pgData, error: pgError } = await supabase
      .from('pg_proc')
      .select('*')
      .eq('proname', 'get_next_wake_times');

    console.log('Using pg_proc query:', pgError || 'Success');
    console.log(JSON.stringify(pgData, null, 2));
  } else if (error) {
    console.log('Error:', error.message);
  } else {
    console.log(data);
  }
} catch (err) {
  console.log('Exception:', err.message);
}

// Alternative: Get function source using information_schema
console.log('\n---\nTrying information_schema.routines...\n');

try {
  const { data, error } = await supabase
    .from('information_schema.routines')
    .select('*')
    .eq('routine_name', 'get_next_wake_times');

  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('Found routines:', data);
  }
} catch (err) {
  console.log('Exception:', err.message);
}
