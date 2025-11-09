import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Test with ANON KEY (like the frontend does)
const supabaseAnon = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function testMattRLSContext() {
  console.log('\n=== Testing Matt\'s RLS Context (Simulating Frontend) ===\n');

  // 1. Sign in as Matt
  console.log('Step 1: Signing in as matt@grmtek.com...');
  const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
    email: 'matt@grmtek.com',
    password: 'Test1234!', // You may need to provide the actual password
  });

  if (authError) {
    console.error('❌ Authentication failed:', authError.message);
    console.log('\nNOTE: If password is incorrect, you can reset it or try another test user.');
    return;
  }

  console.log('✅ Authentication successful');
  console.log('  - User ID:', authData.user.id);
  console.log('  - Email:', authData.user.email);

  // 2. Test RLS helper functions with authenticated context
  console.log('\n Step 2: Testing RLS Helper Functions (with auth context)...\n');

  const { data: isSuperAdmin, error: superAdminError } = await supabaseAnon
    .rpc('is_super_admin');
  console.log('is_super_admin():', isSuperAdmin, superAdminError ? `ERROR: ${superAdminError.message}` : '✅');

  const { data: userCompanyId, error: companyIdError } = await supabaseAnon
    .rpc('get_user_company_id');
  console.log('get_user_company_id():', userCompanyId, companyIdError ? `ERROR: ${companyIdError.message}` : '✅');

  const { data: isCompanyAdmin, error: companyAdminError } = await supabaseAnon
    .rpc('user_is_company_admin');
  console.log('user_is_company_admin():', isCompanyAdmin, companyAdminError ? `ERROR: ${companyAdminError.message}` : '✅');

  // 3. Query programs directly (through RLS)
  console.log('\nStep 3: Querying pilot_programs (with RLS)...\n');

  const { data: programs, error: programsError } = await supabaseAnon
    .from('pilot_programs')
    .select('program_id, name, company_id');

  if (programsError) {
    console.error('❌ Error fetching programs:', programsError);
  } else {
    console.log(`✅ Programs visible through RLS: ${programs?.length || 0}`);
    if (programs && programs.length > 0) {
      programs.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.name}`);
      });
    } else {
      console.log('  ⚠️  No programs returned (RLS is blocking access)');
    }
  }

  // 4. Query programs through the view
  console.log('\nStep 4: Querying pilot_programs_with_progress view (with RLS)...\n');

  const { data: programsView, error: viewError } = await supabaseAnon
    .from('pilot_programs_with_progress')
    .select('program_id, name, company_id');

  if (viewError) {
    console.error('❌ Error fetching programs from view:', viewError);
  } else {
    console.log(`✅ Programs visible through view: ${programsView?.length || 0}`);
    if (programsView && programsView.length > 0) {
      programsView.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.name}`);
      });
    } else {
      console.log('  ⚠️  No programs returned from view (RLS is blocking access)');
    }
  }

  // 5. Check user record
  console.log('\nStep 5: Checking user record from users table...\n');

  const { data: userRecord, error: userError } = await supabaseAnon
    .from('users')
    .select('id, email, company_id, is_company_admin, is_super_admin')
    .eq('id', authData.user.id)
    .single();

  if (userError) {
    console.error('❌ Error fetching user record:', userError);
  } else {
    console.log('✅ User Record:');
    console.log('  - User ID:', userRecord.id);
    console.log('  - Email:', userRecord.email);
    console.log('  - Company ID:', userRecord.company_id);
    console.log('  - Is Company Admin:', userRecord.is_company_admin);
    console.log('  - Is Super Admin:', userRecord.is_super_admin);
  }

  // Sign out
  await supabaseAnon.auth.signOut();
  console.log('\n✅ Signed out');
}

testMattRLSContext().catch(console.error);
