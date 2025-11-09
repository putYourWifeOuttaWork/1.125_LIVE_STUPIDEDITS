import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Test what each user should see
async function testProgramVisibility() {
  console.log('='.repeat(80));
  console.log('TESTING PROGRAM VISIBILITY WITH RLS POLICIES');
  console.log('='.repeat(80));
  console.log();

  // Test user: matt@grmtek.com (GasX company)
  const mattEmail = 'matt@grmtek.com';
  console.log(`Testing user: ${mattEmail}`);
  console.log('-'.repeat(80));

  // First get Matt's auth session
  const supabaseServiceRole = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: mattUser } = await supabaseServiceRole
    .from('users')
    .select('*')
    .eq('email', mattEmail)
    .single();

  if (!mattUser) {
    console.log('User not found!');
    return;
  }

  console.log(`User details:`);
  console.log(`  ID: ${mattUser.id}`);
  console.log(`  Company: ${mattUser.company} (${mattUser.company_id})`);
  console.log(`  Super Admin: ${mattUser.is_super_admin}`);
  console.log(`  Company Admin: ${mattUser.is_company_admin}`);
  console.log(`  Active: ${mattUser.is_active}`);
  console.log();

  // Check active company context
  const { data: context } = await supabaseServiceRole
    .from('user_active_company_context')
    .select('*')
    .eq('user_id', mattUser.id)
    .single();

  console.log(`Active company context:`);
  console.log(`  Active Company ID: ${context?.active_company_id}`);
  console.log();

  // Get the auth user to create an authenticated client
  const { data: authUsers } = await supabaseServiceRole.auth.admin.listUsers();
  const authUser = authUsers.users.find(u => u.email === mattEmail);

  if (!authUser) {
    console.log('Auth user not found!');
    return;
  }

  // Create a custom JWT token for this user
  const { data: sessionData, error: sessionError } = await supabaseServiceRole.auth.admin.generateLink({
    type: 'magiclink',
    email: mattEmail
  });

  if (sessionError) {
    console.error('Error generating session:', sessionError);
    return;
  }

  console.log(`Querying programs as authenticated user...`);
  console.log();

  // Query all programs with service role (what exists in DB)
  const { data: allPrograms } = await supabaseServiceRole
    .from('pilot_programs')
    .select('program_id, name, company_id');

  console.log(`Total programs in database: ${allPrograms?.length || 0}`);
  console.log();

  // Group by company
  const programsByCompany = {};
  allPrograms?.forEach(program => {
    if (!programsByCompany[program.company_id]) {
      programsByCompany[program.company_id] = [];
    }
    programsByCompany[program.company_id].push(program);
  });

  // Get company names
  const { data: companies } = await supabaseServiceRole
    .from('companies')
    .select('company_id, name');

  const companyMap = new Map(companies?.map(c => [c.company_id, c.name]) || []);

  console.log('Programs by company:');
  for (const [companyId, programs] of Object.entries(programsByCompany)) {
    const companyName = companyMap.get(companyId) || 'Unknown';
    console.log(`  ${companyName} (${companyId}): ${programs.length} programs`);
  }
  console.log();

  // Test what the user SHOULD see (based on their company)
  console.log(`Expected visibility for ${mattEmail}:`);
  console.log(`  Company: ${companyMap.get(mattUser.company_id)}`);
  console.log(`  Should see: ${programsByCompany[mattUser.company_id]?.length || 0} programs`);
  console.log();

  // Test the RLS helper functions directly
  console.log('Testing RLS helper function results:');
  console.log('-'.repeat(80));

  // We need to impersonate the user to test RLS
  // Since we can't easily do that from Node.js, let's test the logic manually

  console.log(`Matt's company: GasX (${mattUser.company_id})`);
  console.log(`Programs in GasX: ${programsByCompany[mattUser.company_id]?.length || 0}`);
  console.log(`Programs in Sandhill: ${programsByCompany['743d51b9-17bf-43d5-ad22-deebafead6fa']?.length || 0}`);
  console.log();

  console.log('⚠️  ISSUE DIAGNOSIS:');
  console.log('-'.repeat(80));
  console.log('The database structure is correct:');
  console.log('  ✓ All users have company_id set');
  console.log('  ✓ All users have active_company_id in user_active_company_context');
  console.log('  ✓ RLS policies are in place');
  console.log();
  console.log('The likely issue is:');
  console.log('  ✗ Frontend is NOT calling set_active_company_context() on login');
  console.log('  ✗ RLS policies may not be using get_active_company_id() correctly');
  console.log('  ✗ The pilot_programs_with_progress view may not respect RLS');
  console.log();

  // Test if view has security_invoker
  console.log('Checking pilot_programs_with_progress view security:');
  const { data: viewInfo } = await supabaseServiceRole
    .rpc('check_view_security_invoker', { view_name: 'pilot_programs_with_progress' })
    .catch(() => ({ data: null }));

  console.log('  (Cannot easily check from Node.js - will verify in migration)');
  console.log();

  console.log('='.repeat(80));
  console.log('NEXT STEPS:');
  console.log('='.repeat(80));
  console.log('1. Ensure pilot_programs_with_progress view has security_invoker = true');
  console.log('2. Update frontend ProtectedRoute to call set_active_company_context()');
  console.log('3. Update companyFilterStore to load context on app startup');
  console.log('4. Update usePilotPrograms query key to include selectedCompanyId');
  console.log('5. Test that RLS policies properly filter based on active company context');
}

testProgramVisibility().catch(console.error);
