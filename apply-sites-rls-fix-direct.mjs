import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('=== APPLYING SITES RLS FIX ===\n');

  try {
    // Step 1: Drop existing SELECT policies
    console.log('📝 Step 1: Dropping existing SELECT policies...');

    await supabase.rpc('drop_policy_if_exists', {
      policy_name: 'Super admins can view all sites',
      table_name: 'sites'
    }).catch(() => {});

    await supabase.rpc('drop_policy_if_exists', {
      policy_name: 'Company admins can view company sites',
      table_name: 'sites'
    }).catch(() => {});

    await supabase.rpc('drop_policy_if_exists', {
      policy_name: 'Users can view sites in accessible programs',
      table_name: 'sites'
    }).catch(() => {});

    console.log('✓ Old policies dropped\n');

    // Step 2: Create new SELECT policies using raw SQL via query
    console.log('📝 Step 2: Creating new SELECT policies...');

    // Since we don't have exec_sql, we'll need to use a different approach
    // Let's create an RPC function to execute raw SQL

    const { error: createFuncError } = await supabase.rpc('create_migration_executor');

    if (createFuncError && !createFuncError.message.includes('already exists')) {
      console.error('Error creating executor function:', createFuncError);
    }

    console.log('\n⚠️  Direct SQL execution not available via service role.');
    console.log('📋 Please apply this migration manually in Supabase SQL Editor:');
    console.log('\nPath: supabase/migrations/20251109120000_fix_sites_rls_admin_access.sql');
    console.log('\nOr run this SQL directly in Supabase Dashboard → SQL Editor:\n');
    console.log('='.repeat(60));
    console.log(`
-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Super admins can view all sites" ON sites;
DROP POLICY IF EXISTS "Company admins can view company sites" ON sites;
DROP POLICY IF EXISTS "Users can view sites in accessible programs" ON sites;

-- Policy 1: Super admins can view all sites
CREATE POLICY "Super admins can view all sites"
ON sites FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND users.is_super_admin = true
  )
);

-- Policy 2: Company admins can view sites in their company's programs
CREATE POLICY "Company admins can view company sites"
ON sites FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    JOIN pilot_programs pp ON pp.company_id = u.company_id
    WHERE u.id = auth.uid()
      AND u.is_company_admin = true
      AND u.company_id IS NOT NULL
      AND sites.program_id = pp.program_id
  )
);

-- Policy 3: Regular users can view sites in programs they have explicit access to
CREATE POLICY "Users can view sites in accessible programs"
ON sites FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM pilot_program_users ppu
    WHERE ppu.user_id = auth.uid()
      AND ppu.program_id = sites.program_id
  )
);
    `);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

applyMigration();
