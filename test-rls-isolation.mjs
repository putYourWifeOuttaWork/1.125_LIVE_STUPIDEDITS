import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function testRLSIsolation() {
  console.log('\n=== Testing RLS and Company Isolation ===\n');

  // Test 1: Check if RLS helper functions exist
  console.log('1. Testing RLS helper functions...');
  
  const { data: superAdminCheck, error: superAdminError } = await supabase
    .rpc('is_super_admin');
  
  if (superAdminError) {
    console.error('❌ is_super_admin() function error:', superAdminError.message);
  } else {
    console.log('✅ is_super_admin() function exists:', superAdminCheck);
  }

  const { data: companyIdCheck, error: companyIdError } = await supabase
    .rpc('get_user_company_id');
  
  if (companyIdError) {
    console.error('❌ get_user_company_id() function error:', companyIdError.message);
  } else {
    console.log('✅ get_user_company_id() function exists:', companyIdCheck);
  }

  // Test 2: Check Matt's user profile
  console.log('\n2. Checking current user profile...');
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('❌ Not authenticated');
    return;
  }

  console.log('✅ Authenticated as:', user.email);

  const { data: userProfile, error: profileError } = await supabase
    .from('users')
    .select('id, email, full_name, company, company_id, is_super_admin, is_company_admin, is_active, user_role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('❌ Error fetching user profile:', profileError.message);
  } else {
    console.log('✅ User Profile:');
    console.log('   - Company:', userProfile.company);
    console.log('   - Company ID:', userProfile.company_id);
    console.log('   - Super Admin:', userProfile.is_super_admin);
    console.log('   - Company Admin:', userProfile.is_company_admin);
    console.log('   - Active:', userProfile.is_active);
    console.log('   - Role:', userProfile.user_role);
  }

  // Test 3: Check companies table access
  console.log('\n3. Testing companies table access...');
  
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('company_id, name')
    .order('name');

  if (companiesError) {
    console.error('❌ Error fetching companies:', companiesError.message);
  } else {
    console.log(`✅ Can see ${companies.length} companies:`);
    companies.forEach(c => console.log(`   - ${c.name} (${c.company_id})`));
  }

  // Test 4: Check pilot_programs access
  console.log('\n4. Testing pilot_programs table access...');
  
  const { data: programs, error: programsError } = await supabase
    .from('pilot_programs')
    .select('program_id, name, company_id')
    .order('name');

  if (programsError) {
    console.error('❌ Error fetching programs:', programsError.message);
  } else {
    console.log(`✅ Can see ${programs.length} programs:`);
    programs.forEach(p => console.log(`   - ${p.name} (company_id: ${p.company_id})`));
  }

  // Test 5: Check sites access
  console.log('\n5. Testing sites table access...');
  
  const { data: sites, error: sitesError } = await supabase
    .from('sites')
    .select('site_id, name, company_id')
    .order('name');

  if (sitesError) {
    console.error('❌ Error fetching sites:', sitesError.message);
  } else {
    console.log(`✅ Can see ${sites.length} sites:`);
    sites.forEach(s => console.log(`   - ${s.name} (company_id: ${s.company_id})`));
  }

  // Test 6: Check devices access
  console.log('\n6. Testing devices table access...');
  
  const { data: devices, error: devicesError } = await supabase
    .from('devices')
    .select('device_id, device_name, company_id')
    .limit(10);

  if (devicesError) {
    console.error('❌ Error fetching devices:', devicesError.message);
  } else {
    console.log(`✅ Can see ${devices.length} devices (limited to 10)`);
    devices.forEach(d => console.log(`   - ${d.device_name || d.device_id} (company_id: ${d.company_id})`));
  }

  // Test 7: Check for NULL company_id values
  console.log('\n7. Checking for NULL company_id values...');
  
  const tables = ['pilot_programs', 'sites', 'submissions', 'devices'];
  
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .is('company_id', null);
    
    if (error) {
      console.error(`❌ Error checking ${table}:`, error.message);
    } else {
      if (count === 0) {
        console.log(`✅ ${table}: No NULL company_id values`);
      } else {
        console.warn(`⚠️  ${table}: Found ${count} records with NULL company_id`);
      }
    }
  }

  console.log('\n=== RLS Isolation Test Complete ===\n');
}

testRLSIsolation().catch(console.error);
