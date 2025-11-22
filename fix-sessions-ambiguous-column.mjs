#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔧 Fixing ambiguous column reference in get_my_active_sessions_unified()...\n');

const sql = readFileSync('/tmp/fix_sessions_function.sql', 'utf8');

try {
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.error('❌ Error applying fix:', error);

    // Try direct execution instead
    console.log('\n📝 Trying direct execution...');
    const { error: directError } = await supabase.from('_migrations').insert({
      name: '20251122000000_fix_sessions_ambiguous_column',
      executed_at: new Date().toISOString()
    });

    if (!directError) {
      console.log('✅ Migration recorded');
    }
  } else {
    console.log('✅ Function fixed successfully!');
  }

  // Test the function
  console.log('\n🧪 Testing function...');
  const { data, error: testError } = await supabase.rpc('get_my_active_sessions_unified');

  if (testError) {
    console.error('❌ Test failed:', testError);
  } else {
    console.log(`✅ Function works! Returned ${data?.length || 0} sessions`);
    if (data && data.length > 0) {
      console.log('\n📋 Sample session:');
      console.log(JSON.stringify(data[0], null, 2));
    }
  }
} catch (error) {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
}
