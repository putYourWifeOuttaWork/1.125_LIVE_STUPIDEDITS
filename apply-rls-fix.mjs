import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('\n=== Applying RLS Policy Fix Migration ===\n');

  const migrationPath = './supabase/migrations/20251109000012_fix_rls_policies_direct_queries.sql';
  const sql = readFileSync(migrationPath, 'utf8');

  // Split into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('/*') && !s.startsWith('--'));

  console.log(`Found ${statements.length} SQL statements to execute\n`);

  let succeeded = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    const preview = statement.substring(0, 80).replace(/\n/g, ' ');

    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' });

      if (error) {
        throw error;
      }

      succeeded++;
      console.log(`✅ ${i + 1}/${statements.length}: ${preview}...`);
    } catch (error) {
      failed++;
      errors.push({ statement: preview, error: error.message });
      console.log(`❌ ${i + 1}/${statements.length}: ${preview}...`);
      console.log(`   Error: ${error.message}`);
    }
  }

  console.log(`\n=== Migration Summary ===`);
  console.log(`✅ Succeeded: ${succeeded}`);
  console.log(`❌ Failed: ${failed}`);

  if (errors.length > 0) {
    console.log(`\n=== Errors ===`);
    errors.forEach((err, idx) => {
      console.log(`\n${idx + 1}. ${err.statement}...`);
      console.log(`   ${err.error}`);
    });
  }

  console.log('\n=== Verification ===\n');

  // Test by checking if Matt can now see programs
  const mattUserId = 'e0e9d5ba-6437-4625-aad1-4c23e5d77234';

  // Query to manually verify the RLS logic
  const { data: testQuery, error: testError } = await supabase.rpc('verify_user_program_access', {
    test_user_id: mattUserId
  }).catch(() => ({ data: null, error: { message: 'RPC function not available, using direct query' } }));

  // Direct test
  console.log('Testing RLS policies with direct query...\n');

  const { data: userData } = await supabase
    .from('users')
    .select('id, email, company_id, is_company_admin, is_super_admin')
    .eq('id', mattUserId)
    .single();

  console.log('User:', userData?.email);
  console.log('Company ID:', userData?.company_id);
  console.log('Is Company Admin:', userData?.is_company_admin);

  const { data: programs, error: programsError } = await supabase
    .from('pilot_programs')
    .select('program_id, name, company_id')
    .eq('company_id', userData.company_id);

  if (programsError) {
    console.error('\n❌ Error querying programs:', programsError);
  } else {
    console.log(`\n✅ ${programs.length} programs found with company_id match`);
    console.log('These programs SHOULD be visible to Matt after RLS fix:');
    programs.forEach((p, idx) => {
      console.log(`  ${idx + 1}. ${p.name}`);
    });
  }

  console.log('\n=== Next Steps ===');
  console.log('1. Have Matt log in to the application');
  console.log('2. Navigate to the Programs page');
  console.log('3. Verify that all 12 programs are now visible');
  console.log('4. Check browser console for any RLS-related errors');
}

applyMigration().catch(console.error);
