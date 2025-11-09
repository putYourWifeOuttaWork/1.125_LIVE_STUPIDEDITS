import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkActiveCompanyIds() {
  console.log('='.repeat(80));
  console.log('CHECKING ACTIVE COMPANY IDs vs ASSIGNED COMPANY IDs');
  console.log('='.repeat(80));
  console.log();

  // Get all users with their company assignments
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, company, company_id, is_super_admin, is_active')
    .order('email');

  if (usersError) {
    console.error('Error fetching users:', usersError);
    return;
  }

  // Get all active company contexts
  const { data: contexts, error: contextsError } = await supabase
    .from('user_active_company_context')
    .select('*');

  if (contextsError) {
    console.error('Error fetching contexts:', contextsError);
    return;
  }

  // Get all companies for name lookup
  const { data: companies } = await supabase
    .from('companies')
    .select('company_id, name');

  const companyMap = new Map(companies?.map(c => [c.company_id, c.name]) || []);

  let mismatches = 0;

  for (const user of users) {
    const context = contexts?.find(c => c.user_id === user.id);
    const assignedCompanyName = companyMap.get(user.company_id) || user.company || 'Unknown';
    const activeCompanyName = context?.active_company_id
      ? companyMap.get(context.active_company_id) || 'Unknown'
      : 'NULL';

    const matches = user.company_id === context?.active_company_id;
    const matchSymbol = matches ? '✓' : '✗';

    console.log(`${matchSymbol} ${user.email}`);
    console.log(`   Assigned: ${assignedCompanyName} (${user.company_id || 'NULL'})`);
    console.log(`   Active:   ${activeCompanyName} (${context?.active_company_id || 'NULL'})`);

    if (user.is_super_admin) {
      console.log(`   [SUPER ADMIN - Can switch companies]`);
    }

    if (!matches) {
      console.log(`   ⚠️  MISMATCH DETECTED!`);
      mismatches++;
    }

    console.log();
  }

  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total users: ${users.length}`);
  console.log(`Mismatches found: ${mismatches}`);

  if (mismatches > 0) {
    console.log();
    console.log('⚠️  Action Required: Fix mismatches by updating user_active_company_context');
  } else {
    console.log();
    console.log('✓ All users have matching active company context');
  }
}

checkActiveCompanyIds().catch(console.error);
