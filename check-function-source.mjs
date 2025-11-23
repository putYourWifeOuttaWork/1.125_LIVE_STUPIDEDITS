#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkFunction() {
  console.log('=== Checking Function Source Code ===\n');

  const { data, error } = await supabase
    .rpc('exec_sql', {
      sql: `
        SELECT pg_get_functiondef(oid) as function_def
        FROM pg_proc
        WHERE proname = 'get_session_devices_with_wakes';
      `
    }).single();

  if (error) {
    console.error('Error:', error);
    
    // Try direct query
    const { data: result } = await supabase
      .from('pg_proc')
      .select('*')
      .eq('proname', 'get_session_devices_with_wakes');
    
    console.log('Cannot query pg_proc directly. Let me check the comment instead.');
    
    // Check comment
    const checkComment = await supabase.rpc('exec_sql', {
      sql: "SELECT obj_description('get_session_devices_with_wakes'::regproc);"
    });
    
    console.log('Comment result:', checkComment);
    return;
  }

  console.log(data?.function_def);
}

checkFunction().then(() => process.exit(0)).catch(console.error);
