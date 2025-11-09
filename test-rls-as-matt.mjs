import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Use ANON key to simulate frontend
const supabaseAnon = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Use service role to set up test
const supabaseService = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('='.repeat(80));
console.log('TESTING RLS AS matt@grmtek.com');
console.log('='.repeat(80));
console.log();

async function testRLS() {
  // First, sign in as Matt
  const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
    email: 'matt@grmtek.com',
    password: 'TestPassword123!'  // Replace with actual password if different
  });

  if (signInError) {
    console.error('Failed to sign in:', signInError.message);
    console.log('Please provide the correct password for matt@grmtek.com');
    return;
  }

  console.log('✓ Signed in as matt@grmtek.com');
  console.log();

  // Get user info
  const { data: { user } } = await supabaseAnon.auth.getUser();
  console.log('User ID:', user.id);
  console.log();

  // Check active company context
  const { data: contextCheck } = await supabaseService
    .from('user_active_company_context')
    .select('*')
    .eq('user_id', user.id)
    .single();

  console.log('Active Company Context in DB:');
  console.log(`  active_company_id: ${contextCheck?.active_company_id}`);
  console.log();

  // Now query programs as the authenticated user (simulating frontend)
  console.log('Querying pilot_programs_with_progress as authenticated user...');
  const { data: programs, error: programsError } = await supabaseAnon
    .from('pilot_programs_with_progress')
    .select('program_id, name, company_id')
    .order('name');

  if (programsError) {
    console.error('Error querying programs:', programsError);
  } else {
    console.log(`\nReturned ${programs?.length || 0} programs:`);
    programs?.forEach(p => {
      console.log(`  - ${p.name} (company: ${p.company_id})`);
    });
  }
  console.log();

  // Get company names for reference
  const { data: companies } = await supabaseService
    .from('companies')
    .select('*');

  const companyMap = new Map(companies?.map(c => [c.company_id, c.name]));

  console.log('Expected Result:');
  console.log(`  Matt is in: ${companyMap.get('81084842-9381-45e4-a6f3-27f0b6b83897')} (81084842-9381-45e4-a6f3-27f0b6b83897)`);
  console.log(`  Should see: 0 programs (GasX has no programs)`);
  console.log();

  console.log('Actual Result:');
  if (programs && programs.length > 0) {
    const companiesInResult = new Set(programs.map(p => p.company_id));
    companiesInResult.forEach(companyId => {
      const companyName = companyMap.get(companyId);
      const count = programs.filter(p => p.company_id === companyId).length;
      console.log(`  Seeing ${count} programs from: ${companyName} (${companyId})`);
    });
  } else {
    console.log('  Seeing 0 programs (CORRECT!)');
  }
  console.log();

  if (programs && programs.length > 0) {
    console.log('❌ RLS POLICY FAILURE!');
    console.log('   User is seeing programs from companies they should NOT have access to!');
    console.log();
    console.log('Possible causes:');
    console.log('   1. RLS policy not using get_active_company_id()');
    console.log('   2. pilot_programs_with_progress view not security_invoker');
    console.log('   3. RLS policy has a logic error');
  } else {
    console.log('✓ RLS is working correctly!');
  }

  // Sign out
  await supabaseAnon.auth.signOut();
}

testRLS().catch(console.error);
