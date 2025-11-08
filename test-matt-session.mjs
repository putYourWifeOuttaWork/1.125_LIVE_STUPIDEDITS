import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// NOTE: This script needs Matt to provide his session token
// For now, let's test the RLS functions directly with service role

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testRLSWithMatt() {
  console.log('\n=== Testing RLS Functions Directly ===\n');

  const mattUserId = 'e0e9d5ba-6437-4625-aad1-4c23e5d77234';

  // Test 1: Check if user exists in users table
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', mattUserId)
    .maybeSingle();

  console.log('1. User lookup by ID:');
  if (userError) {
    console.log('   ❌ Error:', userError.message);
  } else if (user) {
    console.log('   ✅ Found user:', user.email);
    console.log('      Company ID:', user.company_id);
    console.log('      Is Company Admin:', user.is_company_admin);
  } else {
    console.log('   ❌ User not found');
  }

  // Test 2: Try to query programs with RLS enabled but using service role
  console.log('\n2. Testing program query (service role bypasses RLS):');
  const { data: programs, error: programsError } = await supabase
    .from('pilot_programs')
    .select('program_id, name, company_id');

  if (programsError) {
    console.log('   ❌ Error:', programsError.message);
  } else {
    console.log(`   ✅ Found ${programs?.length || 0} programs`);
  }

  // Test 3: Try querying the view
  console.log('\n3. Testing view query (service role):');
  const { data: viewPrograms, error: viewError } = await supabase
    .from('pilot_programs_with_progress')
    .select('program_id, name, company_id');

  if (viewError) {
    console.log('   ❌ Error:', viewError.message);
  } else {
    console.log(`   ✅ Found ${viewPrograms?.length || 0} programs from view`);
  }

  // Test 4: Check if migration was applied
  console.log('\n4. Checking if security fix migration was applied:');
  const { data: migrations, error: migrationsError } = await supabase
    .from('supabase_migrations')
    .select('*')
    .order('version', { ascending: false })
    .limit(5);

  if (migrationsError) {
    console.log('   ⚠️  Cannot check migrations:', migrationsError.message);
  } else {
    console.log('   Recent migrations:');
    migrations?.forEach(m => {
      const name = m.name || m.version;
      const applied = m.version.includes('20251109000007') ? '🔴 SECURITY FIX' : '';
      console.log(`      ${m.version} ${applied}`);
    });

    const securityFixApplied = migrations?.some(m => m.version.includes('20251109000007'));
    if (securityFixApplied) {
      console.log('\n   ✅ Security fix migration IS applied');
    } else {
      console.log('\n   ❌ Security fix migration NOT YET applied!');
      console.log('      This is likely the problem - the view still bypasses RLS');
    }
  }

  // Test 5: Check view definition
  console.log('\n5. Checking view definition:');
  const { data: viewDef, error: viewDefError } = await supabase
    .rpc('exec_sql', {
      sql: `
        SELECT pg_get_viewdef('pilot_programs_with_progress'::regclass, true) as definition;
      `
    })
    .catch(() => null);

  // If that doesn't work, try a different approach
  const { data: viewCheck } = await supabase
    .from('pg_views')
    .select('*')
    .eq('viewname', 'pilot_programs_with_progress')
    .maybeSingle()
    .catch(() => ({ data: null }));

  if (viewCheck) {
    console.log('   View exists in database');
  }

  console.log('\n=== DIAGNOSIS ===\n');
  console.log('Matt\'s Data:');
  console.log('  ✅ User ID exists in users table');
  console.log('  ✅ Has company_id:', user?.company_id);
  console.log('  ✅ Is marked as company admin');
  console.log('  ✅ Company has 12 programs');
  console.log('\nProblem:');
  console.log('  ❌ RLS helper functions return NULL/false');
  console.log('\nMost Likely Cause:');
  console.log('  The security fix migration (20251109000007) has NOT been applied yet.');
  console.log('  The view is still bypassing RLS, but now that RLS is enabled,');
  console.log('  queries through the view fail because the view doesn\'t have');
  console.log('  proper security context.');
  console.log('\nSolution:');
  console.log('  Apply migration 20251109000007_fix_view_security_invoker.sql');
}

testRLSWithMatt().catch(console.error);
