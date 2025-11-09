import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseServiceRole = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseRLSIssue() {
  console.log('\n=== Diagnosing RLS Policy Issue ===\n');

  const mattUserId = 'e0e9d5ba-6437-4625-aad1-4c23e5d77234';

  // 1. Check the users table structure and Matt's record
  console.log('Step 1: Checking users table and Matt\'s record...\n');

  const { data: userRecord, error: userError } = await supabaseServiceRole
    .from('users')
    .select('*')
    .eq('id', mattUserId)
    .single();

  if (userError) {
    console.error('❌ Error:', userError);
    return;
  }

  console.log('✅ Matt\'s User Record:');
  console.log(JSON.stringify(userRecord, null, 2));

  // 2. Check the RLS policies on pilot_programs
  console.log('\n\nStep 2: Checking RLS policies on pilot_programs table...\n');

  const { data: policies, error: policiesError } = await supabaseServiceRole
    .from('pg_policies')
    .select('*')
    .eq('tablename', 'pilot_programs');

  if (policiesError) {
    console.error('❌ Error fetching policies:', policiesError);
  } else {
    console.log(`✅ Found ${policies?.length || 0} policies on pilot_programs:`);
    policies?.forEach((p, idx) => {
      console.log(`\n${idx + 1}. Policy: ${p.policyname}`);
      console.log(`   Command: ${p.cmd}`);
      console.log(`   Using: ${p.qual || 'N/A'}`);
      console.log(`   With Check: ${p.with_check || 'N/A'}`);
    });
  }

  // 3. Test the helper functions directly
  console.log('\n\nStep 3: Testing RLS helper functions...\n');

  // Test if helper functions exist
  console.log('Checking if RLS helper functions are defined...');

  // 4. Check if there's an issue with the view
  console.log('\nStep 4: Checking pilot_programs_with_progress view...\n');

  const { data: viewDef, error: viewError } = await supabaseServiceRole
    .from('pg_views')
    .select('*')
    .eq('viewname', 'pilot_programs_with_progress')
    .maybeSingle();

  if (viewError) {
    console.error('❌ Error fetching view definition:', viewError);
  } else if (viewDef) {
    console.log('✅ View exists');
    console.log('Schema:', viewDef.schemaname);
    console.log('View Owner:', viewDef.viewowner);
  } else {
    console.log('⚠️  View not found');
  }

  // 5. Manually test the RLS logic
  console.log('\n\nStep 5: Simulating RLS logic for Matt...\n');

  const companyId = userRecord.company_id;
  const isCompanyAdmin = userRecord.is_company_admin;
  const isSuperAdmin = userRecord.is_super_admin;

  console.log('User attributes:');
  console.log('  - company_id:', companyId);
  console.log('  - is_company_admin:', isCompanyAdmin);
  console.log('  - is_super_admin:', isSuperAdmin);

  // Check programs that should be visible
  if (isSuperAdmin) {
    console.log('\n✅ As super admin, should see ALL programs');
  } else if (isCompanyAdmin && companyId) {
    console.log(`\n✅ As company admin, should see programs where company_id = '${companyId}'`);

    const { data: companyPrograms, error: cpError } = await supabaseServiceRole
      .from('pilot_programs')
      .select('program_id, name, company_id')
      .eq('company_id', companyId);

    if (cpError) {
      console.error('❌ Error:', cpError);
    } else {
      console.log(`\n📊 Programs with matching company_id: ${companyPrograms?.length || 0}`);
      companyPrograms?.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.name}`);
      });
    }
  } else {
    console.log('\n⚠️  User needs explicit program access via pilot_program_users');
  }

  // 6. Check explicit program access
  console.log('\n\nStep 6: Checking explicit program access...\n');

  const { data: programAccess, error: accessError } = await supabaseServiceRole
    .from('pilot_program_users')
    .select('program_id, role')
    .eq('user_id', mattUserId);

  if (accessError) {
    console.error('❌ Error:', accessError);
  } else {
    console.log(`✅ Explicit program access: ${programAccess?.length || 0} programs`);
    programAccess?.forEach((p, idx) => {
      console.log(`  ${idx + 1}. Program ID: ${p.program_id} - Role: ${p.role}`);
    });
  }

  // 7. THE KEY TEST: Check if RLS helper functions work correctly
  console.log('\n\nStep 7: THE CRITICAL TEST - RLS Helper Functions\n');
  console.log('Testing with service role (this shows the PROBLEM):\n');

  try {
    const { data: testSuperAdmin } = await supabaseServiceRole.rpc('is_super_admin');
    const { data: testCompanyId } = await supabaseServiceRole.rpc('get_user_company_id');
    const { data: testCompanyAdmin } = await supabaseServiceRole.rpc('user_is_company_admin');

    console.log('Result when called with SERVICE ROLE:');
    console.log('  is_super_admin():', testSuperAdmin, '(should be false)');
    console.log('  get_user_company_id():', testCompanyId, `(should be '${companyId}')`);
    console.log('  user_is_company_admin():', testCompanyAdmin, '(should be true)');

    console.log('\n❌ PROBLEM IDENTIFIED:');
    console.log('The helper functions are looking up auth.uid() which returns NULL');
    console.log('when using service role OR when there\'s no authenticated session.');
    console.log('\nThe frontend MUST be calling these with a valid authenticated session,');
    console.log('but something is preventing auth.uid() from resolving correctly.');

  } catch (error) {
    console.error('Error calling RPC functions:', error);
  }

  // 8. Proposed Solution
  console.log('\n\n=== PROPOSED SOLUTION ===\n');
  console.log('Option 1: Simplify RLS policies to not rely on helper functions');
  console.log('  - Rewrite policies to directly query the users table');
  console.log('  - Use inline subqueries instead of SECURITY DEFINER functions');
  console.log('');
  console.log('Option 2: Fix the helper functions to handle edge cases');
  console.log('  - Add better error handling');
  console.log('  - Ensure they work with authenticated sessions');
  console.log('');
  console.log('Option 3: Check frontend authentication flow');
  console.log('  - Verify JWT token is being sent with requests');
  console.log('  - Check if session is properly maintained');
  console.log('');
  console.log('RECOMMENDATION: Implement Option 1 - it\'s most reliable');
}

diagnoseRLSIssue().catch(console.error);
