import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('='.repeat(80));
console.log('DIAGNOSING matt@grmtek.com USER DATA');
console.log('='.repeat(80));
console.log();

async function diagnoseMatt() {
  // Get Matt's user record
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', 'matt@grmtek.com')
    .single();

  console.log('User Record:');
  console.log(JSON.stringify(user, null, 2));
  console.log();

  // Get active company context
  const { data: context } = await supabase
    .from('user_active_company_context')
    .select('*')
    .eq('user_id', user.id)
    .single();

  console.log('Active Company Context:');
  console.log(JSON.stringify(context, null, 2));
  console.log();

  // Get company details
  const { data: companies } = await supabase
    .from('companies')
    .select('*');

  console.log('All Companies:');
  companies.forEach(c => {
    console.log(`  ${c.name}: ${c.company_id}`);
    if (c.company_id === user.company_id) {
      console.log(`    ^^^ USER'S ASSIGNED COMPANY`);
    }
    if (c.company_id === context?.active_company_id) {
      console.log(`    ^^^ USER'S ACTIVE COMPANY CONTEXT`);
    }
  });
  console.log();

  // Check programs in each company
  const { data: allPrograms } = await supabase
    .from('pilot_programs')
    .select('program_id, name, company_id');

  console.log('Programs by Company:');
  companies.forEach(c => {
    const programs = allPrograms.filter(p => p.company_id === c.company_id);
    console.log(`  ${c.name} (${c.company_id}): ${programs.length} programs`);
    programs.forEach(p => console.log(`    - ${p.name}`));
  });
  console.log();

  // Diagnose mismatch
  if (user.company_id !== context?.active_company_id) {
    console.log('⚠️  MISMATCH DETECTED!');
    console.log(`   User's company_id: ${user.company_id}`);
    console.log(`   Active company context: ${context?.active_company_id}`);
    console.log();
    console.log('This will cause RLS to filter by the WRONG company!');
  } else {
    console.log('✓ User company_id matches active company context');
  }
}

diagnoseMatt().catch(console.error);
