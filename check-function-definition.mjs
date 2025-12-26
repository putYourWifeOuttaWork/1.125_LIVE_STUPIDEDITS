import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking fn_assign_device_to_site function definition...\n');

// Query the function definition from pg_proc
const { data, error } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT 
      pg_get_functiondef(p.oid) as function_definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'fn_assign_device_to_site';
  `
});

if (error) {
  console.log('⚠️  Cannot query function definition directly.');
  console.log('   Error:', error.message);
  console.log('\n📋 To check if audit_log references exist, please:');
  console.log('   1. Go to Supabase Dashboard > SQL Editor');
  console.log('   2. Run: SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = \'fn_assign_device_to_site\';');
  console.log('   3. Search for "audit_log" in the function body');
  console.log('\n   If found, apply the migration from: fix_audit_log_references.sql');
} else {
  const functionDef = data[0]?.function_definition;
  if (functionDef) {
    if (functionDef.includes('audit_log')) {
      console.log('❌ audit_log reference found in function!\n');
      console.log('⚠️  MIGRATION NEEDS TO BE APPLIED ⚠️\n');
      console.log('File location: /tmp/cc-agent/51386994/project/fix_audit_log_references.sql');
      console.log('Apply via: Supabase Dashboard > SQL Editor');
    } else {
      console.log('✅ No audit_log references found in function!');
      console.log('   The function has already been fixed or was never broken.');
    }
  }
}

