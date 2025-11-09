import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseCompanyContextState() {
  console.log('='.repeat(80));
  console.log('COMPANY CONTEXT STATE DIAGNOSTIC');
  console.log('='.repeat(80));
  console.log();

  // 1. Check all companies
  console.log('1. COMPANIES IN SYSTEM');
  console.log('-'.repeat(80));
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('company_id, name')
    .order('name');

  if (companiesError) {
    console.error('Error fetching companies:', companiesError);
    return;
  }

  companies.forEach(company => {
    console.log(`   ${company.name} (${company.company_id})`);
  });
  console.log();

  // 2. Check all users and their company assignments
  console.log('2. USER COMPANY ASSIGNMENTS');
  console.log('-'.repeat(80));
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, full_name, company, company_id, is_active, is_super_admin, is_company_admin')
    .order('email');

  if (usersError) {
    console.error('Error fetching users:', usersError);
    return;
  }

  let usersWithoutCompany = 0;
  let activeUsersWithoutCompany = 0;
  let inactiveUsers = 0;

  users.forEach(user => {
    const hasCompany = !!user.company_id;
    const isActive = user.is_active !== false;
    const roleInfo = [];

    if (user.is_super_admin) roleInfo.push('SUPER_ADMIN');
    if (user.is_company_admin) roleInfo.push('COMPANY_ADMIN');

    const status = isActive ? '✓ ACTIVE' : '✗ INACTIVE';
    const companyInfo = hasCompany
      ? `Company: ${user.company || 'Unknown'} (${user.company_id})`
      : '⚠️  NO COMPANY ASSIGNED';

    console.log(`   ${user.email}`);
    console.log(`      Status: ${status} | ${companyInfo}`);
    if (roleInfo.length > 0) {
      console.log(`      Roles: ${roleInfo.join(', ')}`);
    }
    console.log();

    if (!hasCompany) {
      usersWithoutCompany++;
      if (isActive) activeUsersWithoutCompany++;
    }
    if (!isActive) inactiveUsers++;
  });

  console.log('   Summary:');
  console.log(`   - Total users: ${users.length}`);
  console.log(`   - Users without company: ${usersWithoutCompany}`);
  console.log(`   - Active users without company: ${activeUsersWithoutCompany}`);
  console.log(`   - Inactive users: ${inactiveUsers}`);
  console.log();

  // 3. Check user_active_company_context table
  console.log('3. ACTIVE COMPANY CONTEXT ENTRIES');
  console.log('-'.repeat(80));
  const { data: contexts, error: contextsError } = await supabase
    .from('user_active_company_context')
    .select('user_id, active_company_id, updated_at');

  if (contextsError) {
    console.error('Error fetching active company contexts:', contextsError);
    return;
  }

  console.log(`   Total context entries: ${contexts?.length || 0}`);
  console.log();

  // Find users missing from context table
  const contextUserIds = new Set(contexts?.map(c => c.user_id) || []);
  const usersMissingContext = users.filter(u => !contextUserIds.has(u.id));

  if (usersMissingContext.length > 0) {
    console.log('   ⚠️  USERS MISSING ACTIVE COMPANY CONTEXT:');
    usersMissingContext.forEach(user => {
      console.log(`      - ${user.email} (${user.id})`);
      console.log(`        Company ID: ${user.company_id || 'NULL'}`);
    });
    console.log();
  }

  // Find contexts with NULL active_company_id
  const contextsWithNull = contexts?.filter(c => !c.active_company_id) || [];
  if (contextsWithNull.length > 0) {
    console.log('   ⚠️  CONTEXT ENTRIES WITH NULL active_company_id:');
    contextsWithNull.forEach(context => {
      const user = users.find(u => u.id === context.user_id);
      console.log(`      - ${user?.email || 'Unknown'} (${context.user_id})`);
    });
    console.log();
  }

  // 4. Check pilot_programs
  console.log('4. PROGRAMS BY COMPANY');
  console.log('-'.repeat(80));
  for (const company of companies) {
    const { data: programs, error: programsError } = await supabase
      .from('pilot_programs')
      .select('program_id, name')
      .eq('company_id', company.company_id);

    if (programsError) {
      console.error(`Error fetching programs for ${company.name}:`, programsError);
      continue;
    }

    console.log(`   ${company.name}: ${programs?.length || 0} programs`);
    programs?.forEach(program => {
      console.log(`      - ${program.name}`);
    });
  }
  console.log();

  // 5. Generate fix recommendations
  console.log('5. RECOMMENDATIONS');
  console.log('-'.repeat(80));

  if (activeUsersWithoutCompany > 0) {
    console.log('   ⚠️  CRITICAL: Active users without company assignment found!');
    console.log('      These users should be set to is_active=false until assigned to a company.');
    console.log();
  }

  if (usersMissingContext.length > 0) {
    console.log('   ⚠️  WARNING: Users missing active company context entries!');
    console.log('      These entries need to be backfilled.');
    console.log();
  }

  if (contextsWithNull.length > 0) {
    console.log('   ⚠️  WARNING: Context entries with NULL active_company_id!');
    console.log('      These need to be updated with valid company IDs.');
    console.log();
  }

  if (activeUsersWithoutCompany === 0 && usersMissingContext.length === 0 && contextsWithNull.length === 0) {
    console.log('   ✓ All checks passed! Database is in good state.');
    console.log();
  }

  console.log('='.repeat(80));
  console.log('DIAGNOSTIC COMPLETE');
  console.log('='.repeat(80));
}

diagnoseCompanyContextState().catch(console.error);
