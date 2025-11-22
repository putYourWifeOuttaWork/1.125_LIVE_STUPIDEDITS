#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false
    }
  }
);

// Sign in as a test user
const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email: 'matt@grmtek.com',
  password: 'test123'
});

if (authError) {
  console.error('❌ Auth error:', authError);
  process.exit(1);
}

console.log('✅ Authenticated as matt@grmtek.com\n');

// Now test the function call
console.log('🧪 Testing get_my_active_device_sessions...\n');
const { data, error } = await supabase.rpc('get_my_active_device_sessions');

if (error) {
  console.error('❌ Function call error:', error);
} else {
  console.log(`✅ SUCCESS! Found ${data?.length || 0} device sessions:\n`);
  data?.forEach((s, idx) => {
    console.log(`${idx + 1}. ${s.site_name} - ${s.session_date}`);
    console.log(`   Program: ${s.program_name}`);
    console.log(`   Company: ${s.company_name}`);
    console.log(`   Progress: ${s.completed_items}/${s.expected_items} wakes (${s.progress_percent}%)`);
    console.log(`   Status: ${s.status}`);
    console.log('');
  });
}
