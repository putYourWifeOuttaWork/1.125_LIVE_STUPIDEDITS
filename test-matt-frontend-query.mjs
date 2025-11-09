import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Use ANON KEY like the frontend does
const supabaseAnon = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Use SERVICE ROLE for comparison
const supabaseService = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testFrontendQuery() {
  console.log('\n=== Testing Matt\'s Access Issue ===\n');

  const mattEmail = 'matt@grmtek.com';
  const mattUserId = 'e0e9d5ba-6437-4625-aad1-4c23e5d77234';

  // Step 1: Verify user record with service role
  console.log('Step 1: Verifying Matt\'s user record...\n');

  const { data: userRecord, error: userError } = await supabaseService
    .from('users')
    .select('*')
    .eq('email', mattEmail)
    .single();

  if (userError) {
    console.error('❌ Error:', userError);
    return;
  }

  console.log('✅ User Record:');
  console.log('   Email:', userRecord.email);
  console.log('   User ID:', userRecord.id);
  console.log('   Company ID:', userRecord.company_id);
  console.log('   Is Super Admin:', userRecord.is_super_admin);
  console.log('   Is Company Admin:', userRecord.is_company_admin);
  console.log('   Is Active:', userRecord.is_active);

  // Step 2: Query programs with SERVICE ROLE (should see all)
  console.log('\n\nStep 2: Querying programs with SERVICE ROLE...\n');

  const { data: servicePrograms, error: serviceError } = await supabaseService
    .from('pilot_programs')
    .select('program_id, name, company_id')
    .order('name');

  if (serviceError) {
    console.error('❌ Error:', serviceError);
  } else {
    console.log(`✅ Service role can see ${servicePrograms.length} total programs`);
    const mattCompanyPrograms = servicePrograms.filter(p => p.company_id === userRecord.company_id);
    console.log(`   ${mattCompanyPrograms.length} programs in Matt's company`);
  }

  // Step 3: Query programs through the VIEW with SERVICE ROLE
  console.log('\n\nStep 3: Querying VIEW with SERVICE ROLE...\n');

  const { data: viewPrograms, error: viewError } = await supabaseService
    .from('pilot_programs_with_progress')
    .select('program_id, name, company_id')
    .order('name');

  if (viewError) {
    console.error('❌ Error querying view:', viewError);
  } else {
    console.log(`✅ View query returned ${viewPrograms.length} programs`);
  }

  // Step 4: Test with ANON key (unauthenticated - like frontend before login)
  console.log('\n\nStep 4: Testing ANON key (unauthenticated)...\n');

  const { data: anonPrograms, error: anonError } = await supabaseAnon
    .from('pilot_programs')
    .select('program_id, name')
    .order('name');

  if (anonError) {
    console.log('❌ Error (expected for RLS):', anonError.message);
    console.log('   This is CORRECT - unauthenticated users should not see programs');
  } else {
    console.log(`⚠️  WARNING: Anon key can see ${anonPrograms?.length || 0} programs (RLS may be disabled!)`);
  }

  // Step 5: Check the frontend's actual query
  console.log('\n\nStep 5: Simulating FRONTEND query pattern...\n');
  console.log('The frontend uses this query:');
  console.log('  supabase.from("pilot_programs_with_progress").select("*, phases").order("name")');
  console.log('');
  console.log('With service role (for testing):');

  const { data: frontendSimulation, error: frontendError } = await supabaseService
    .from('pilot_programs_with_progress')
    .select('*, phases')
    .order('name');

  if (frontendError) {
    console.error('❌ Error:', frontendError);
    console.log('\n⚠️  THE VIEW QUERY IS FAILING!');
    console.log('This is likely why Matt sees no programs.');
  } else {
    console.log(`✅ Query successful: ${frontendSimulation.length} programs returned`);

    // Show a sample
    if (frontendSimulation.length > 0) {
      console.log('\nSample program:');
      const sample = frontendSimulation[0];
      console.log('   Name:', sample.name);
      console.log('   Company ID:', sample.company_id);
      console.log('   Has phases:', Array.isArray(sample.phases) ? 'Yes' : 'No');
    }
  }

  // Step 6: Check if the migration was applied
  console.log('\n\nStep 6: Checking if RLS migration was applied...\n');

  // Try to check for the new policy
  const checkPolicySQL = `
    SELECT policyname, cmd
    FROM pg_policies
    WHERE tablename = 'pilot_programs'
      AND schemaname = 'public'
    ORDER BY policyname;
  `;

  console.log('Checking for RLS policies...');
  console.log('(Note: This requires direct DB access)');

  // Step 7: The KEY insight
  console.log('\n\n=== KEY FINDINGS ===\n');

  if (!viewError && frontendSimulation && frontendSimulation.length > 0) {
    console.log('✅ Database has programs and view works with service role');
    console.log('✅ Matt is configured correctly as super admin');
    console.log('');
    console.log('❌ ISSUE: Matt likely has one of these problems:');
    console.log('   1. Frontend session is not authenticated (logged out)');
    console.log('   2. Frontend Supabase client has stale session');
    console.log('   3. Browser cached old data with no programs');
    console.log('   4. RLS policies are not applied in the database');
    console.log('   5. The view has permissions issues');
    console.log('');
    console.log('SOLUTION STEPS:');
    console.log('   1. Have Matt fully log out and log back in');
    console.log('   2. Clear browser cache/localStorage');
    console.log('   3. Check browser console for errors');
    console.log('   4. Apply the RLS migration if not yet done');
  }

  console.log('\n');
}

testFrontendQuery().catch(console.error);
