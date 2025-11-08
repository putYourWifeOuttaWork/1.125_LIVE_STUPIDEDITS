import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkMattUser() {
  console.log('\n=== Checking Matt User (matt@grmtek.com) ===\n');

  // 1. Check user record
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('email', 'matt@grmtek.com')
    .maybeSingle();

  if (userError) {
    console.error('Error fetching user:', userError);
    return;
  }

  if (!user) {
    console.log('❌ User matt@grmtek.com NOT FOUND in users table');
    return;
  }

  console.log('✅ User Found:');
  console.log('  - User ID:', user.id);
  console.log('  - Email:', user.email);
  console.log('  - Full Name:', user.full_name);
  console.log('  - Company ID:', user.company_id || 'NULL ❌');
  console.log('  - Is Super Admin:', user.is_super_admin || false);
  console.log('  - Is Company Admin:', user.is_company_admin || false);

  // 2. Check company if user has company_id
  if (user.company_id) {
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('company_id', user.company_id)
      .maybeSingle();

    if (companyError) {
      console.error('\nError fetching company:', companyError);
    } else if (company) {
      console.log('\n✅ Company Found:');
      console.log('  - Company ID:', company.company_id);
      console.log('  - Company Name:', company.name);
      console.log('  - Description:', company.description || 'N/A');
    } else {
      console.log('\n❌ Company NOT FOUND for company_id:', user.company_id);
    }
  } else {
    console.log('\n❌ User has NO company_id assigned');
  }

  // 3. Check programs in the company
  if (user.company_id) {
    const { data: programs, error: programsError } = await supabase
      .from('pilot_programs')
      .select('program_id, name, company_id')
      .eq('company_id', user.company_id);

    if (programsError) {
      console.error('\nError fetching programs:', programsError);
    } else {
      console.log(`\n✅ Programs in user's company: ${programs?.length || 0}`);
      if (programs && programs.length > 0) {
        programs.forEach((p, idx) => {
          console.log(`  ${idx + 1}. ${p.name} (${p.program_id})`);
        });
      } else {
        console.log('  ❌ No programs found for this company');
      }
    }
  }

  // 4. Check explicit program access
  const { data: programAccess, error: accessError } = await supabase
    .from('pilot_program_users')
    .select(`
      program_id,
      role,
      pilot_programs (name, company_id)
    `)
    .eq('user_id', user.id);

  if (accessError) {
    console.error('\nError fetching program access:', accessError);
  } else {
    console.log(`\n✅ Explicit Program Access: ${programAccess?.length || 0}`);
    if (programAccess && programAccess.length > 0) {
      programAccess.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.pilot_programs?.name} - Role: ${p.role}`);
      });
    } else {
      console.log('  ⚠️  No explicit program access granted');
    }
  }

  // 5. Check all programs (without RLS) to see what exists
  const { data: allPrograms, error: allProgramsError } = await supabase
    .from('pilot_programs')
    .select('program_id, name, company_id');

  if (allProgramsError) {
    console.error('\nError fetching all programs:', allProgramsError);
  } else {
    console.log(`\n📊 Total Programs in Database: ${allPrograms?.length || 0}`);

    // Group by company_id
    const byCompany = {};
    allPrograms?.forEach(p => {
      const companyId = p.company_id || 'NULL';
      if (!byCompany[companyId]) {
        byCompany[companyId] = [];
      }
      byCompany[companyId].push(p.name);
    });

    Object.entries(byCompany).forEach(([companyId, programs]) => {
      console.log(`  Company ${companyId}: ${programs.length} programs`);
      programs.forEach(name => console.log(`    - ${name}`));
    });
  }

  // 6. Test RLS helper functions
  console.log('\n=== Testing RLS Helper Functions ===\n');

  // Test is_super_admin
  const { data: isSuperAdmin, error: superAdminError } = await supabase
    .rpc('is_super_admin');
  console.log('is_super_admin():', isSuperAdmin, superAdminError ? `ERROR: ${superAdminError.message}` : '');

  // Test get_user_company_id
  const { data: userCompanyId, error: companyIdError } = await supabase
    .rpc('get_user_company_id');
  console.log('get_user_company_id():', userCompanyId, companyIdError ? `ERROR: ${companyIdError.message}` : '');

  // Test user_is_company_admin
  const { data: isCompanyAdmin, error: companyAdminError } = await supabase
    .rpc('user_is_company_admin');
  console.log('user_is_company_admin():', isCompanyAdmin, companyAdminError ? `ERROR: ${companyAdminError.message}` : '');
}

checkMattUser().catch(console.error);
