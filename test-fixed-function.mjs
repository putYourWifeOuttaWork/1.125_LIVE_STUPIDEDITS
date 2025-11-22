#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🧪 Testing FIXED device sessions function...\n');

// Read and execute the SQL
const sql = readFileSync('/tmp/cc-agent/51386994/project/FIX_DEVICE_SESSIONS_FUNCTION.sql', 'utf8');

console.log('📝 Applying fixed function...\n');

// Split into individual statements and execute
const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'));

for (const statement of statements) {
  const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
  if (error && error.code !== 'PGRST202') {
    console.error('❌ Error:', error);
  }
}

// Now test the function
console.log('🧪 Testing function call...\n');
const { data, error } = await supabase.rpc('get_my_active_device_sessions');

if (error) {
  console.error('❌ Function call error:', error);
} else {
  console.log(`✅ Success! Found ${data?.length || 0} device sessions:\n`);
  data?.forEach((s, idx) => {
    console.log(`${idx + 1}. ${s.site_name} - ${s.session_date}`);
    console.log(`   Program: ${s.program_name}`);
    console.log(`   Company: ${s.company_name}`);
    console.log(`   Progress: ${s.completed_items}/${s.expected_items} wakes (${s.progress_percent}%)`);
    console.log(`   Status: ${s.status}`);
    console.log('');
  });
}
