import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('='.repeat(80));
console.log('TESTING get_active_company_id() FUNCTION');
console.log('='.repeat(80));
console.log();

async function testFunction() {
  const mattUserId = 'e0e9d5ba-6437-4625-aad1-4c23e5d77234';

  // Check the raw data
  const { data: context } = await supabase
    .from('user_active_company_context')
    .select('*')
    .eq('user_id', mattUserId)
    .single();

  console.log('Raw user_active_company_context data:');
  console.log(JSON.stringify(context, null, 2));
  console.log();

  // Test the RPC function by calling it with Matt's user context
  // Note: This won't work perfectly because we can't truly impersonate the user from Node.js
  // But we can verify the function exists and check its logic

  console.log('Expected behavior:');
  console.log(`  When Matt (${mattUserId}) queries,`);
  console.log(`  get_active_company_id() should return: ${context?.active_company_id}`);
  console.log(`  Which is: GasX (81084842-9381-45e4-a6f3-27f0b6b83897)`);
  console.log();

  // Check if there are ANY programs visible without RLS
  const { data: allPrograms } = await supabase
    .from('pilot_programs')
    .select('program_id, name, company_id');

  console.log(`Total programs in database (no RLS): ${allPrograms?.length}`);
  console.log();

  // The issue is likely that the view pilot_programs_with_progress
  // is NOT respecting RLS or not using security_invoker correctly

  // Let's check the view definition
  console.log('Checking if pilot_programs_with_progress uses security_invoker...');
  console.log('(Cannot easily check from Node.js, but it should be set in migration)');
  console.log();

  console.log('⚠️  LIKELY ISSUE:');
  console.log('   The frontend queries pilot_programs_with_progress VIEW');
  console.log('   If the view does NOT have security_invoker = true,');
  console.log('   it will bypass RLS and show ALL programs!');
  console.log();
  console.log('SOLUTION:');
  console.log('   ALTER VIEW pilot_programs_with_progress SET (security_invoker = true);');
}

testFunction().catch(console.error);
