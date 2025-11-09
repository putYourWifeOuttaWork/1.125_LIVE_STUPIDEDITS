import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  console.log('\n=== Database Schema Check ===\n');

  // Check users table structure
  console.log('1. Checking users table columns...');
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, company, company_id, is_super_admin, is_company_admin, is_active, user_role, export_rights')
    .limit(5);

  if (usersError) {
    console.error('❌ Error:', usersError.message);
  } else {
    console.log('✅ Users table has all required columns');
    console.log('Sample users:', users.length, 'found');
  }

  // Check Matt's profile specifically
  console.log('\n2. Checking Matt\'s user profile...');
  const { data: matt, error: mattError } = await supabase
    .from('users')
    .select('*')
    .eq('email', 'matt@grmtek.com')
    .single();

  if (mattError) {
    console.error('❌ Error:', mattError.message);
  } else {
    console.log('✅ Matt\'s profile:');
    console.log(JSON.stringify(matt, null, 2));
  }

  // Check companies table
  console.log('\n3. Checking companies...');
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('company_id, name')
    .order('name');

  if (companiesError) {
    console.error('❌ Error:', companiesError.message);
  } else {
    console.log(`✅ Found ${companies.length} companies:`);
    companies.forEach(c => console.log(`   - ${c.name} (${c.company_id})`));
  }

  // Check for NULL company_id in key tables
  console.log('\n4. Checking for NULL company_id values...');
  
  const tables = ['pilot_programs', 'sites', 'submissions', 'devices', 'users'];
  
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('company_id', { count: 'exact', head: true })
      .is('company_id', null);
    
    if (error) {
      console.error(`❌ ${table}:`, error.message);
    } else {
      if (count === 0) {
        console.log(`✅ ${table}: No NULL company_id`);
      } else {
        console.warn(`⚠️  ${table}: ${count} records with NULL company_id`);
      }
    }
  }

  console.log('\n=== Schema Check Complete ===\n');
}

checkSchema().catch(console.error);
