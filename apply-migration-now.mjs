import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

console.log('📦 Connecting to Supabase...');
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

console.log('📄 Reading migration file...');
const sql = readFileSync('./supabase/migrations/20251109160000_user_management_and_device_pool.sql', 'utf8');

console.log('🔧 Applying migration...');
console.log('   This migration will:');
console.log('   1. Drop existing functions (if any)');
console.log('   2. Create user management functions');
console.log('   3. Create device pool functions');
console.log('   4. Update RLS policies\n');

// Try to execute the entire migration as a transaction
// Since we can't use exec RPC, we'll manually execute the key statements

async function applyMigration() {
  const operations = [
    {
      name: 'Drop existing functions',
      queries: [
        'DROP FUNCTION IF EXISTS search_users_by_email(text)',
        'DROP FUNCTION IF EXISTS add_user_to_company(text, uuid)',
        'DROP FUNCTION IF EXISTS remove_user_from_company(uuid)',
        'DROP FUNCTION IF EXISTS get_unassigned_devices()',
        'DROP FUNCTION IF EXISTS assign_device_to_company(uuid, uuid)',
        'DROP FUNCTION IF EXISTS get_device_pool_stats()'
      ]
    }
  ];

  // Since we can't execute raw SQL via RPC, we need to use the Supabase Dashboard
  console.log('\n⚠️  MANUAL APPLICATION REQUIRED\n');
  console.log('The migration file has been updated to drop existing functions first.');
  console.log('Please apply it manually using one of these methods:\n');

  console.log('METHOD 1: Supabase Dashboard (Recommended)');
  console.log('-------------------------------------------');
  console.log('1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new');
  console.log('2. Copy the contents of: supabase/migrations/20251109160000_user_management_and_device_pool.sql');
  console.log('3. Paste into the SQL Editor');
  console.log('4. Click "Run" button');
  console.log('5. Wait for success message\n');

  console.log('METHOD 2: psql (If you have database URL)');
  console.log('------------------------------------------');
  console.log('psql $DATABASE_URL -f supabase/migrations/20251109160000_user_management_and_device_pool.sql\n');

  console.log('METHOD 3: Supabase CLI (If installed)');
  console.log('--------------------------------------');
  console.log('supabase db push\n');

  console.log('✅ The migration file is ready at:');
  console.log('   supabase/migrations/20251109160000_user_management_and_device_pool.sql\n');

  console.log('📋 After applying, verify with:');
  console.log('   SELECT routine_name FROM information_schema.routines');
  console.log('   WHERE routine_name IN (');
  console.log("     'search_users_by_email',");
  console.log("     'add_user_to_company',");
  console.log("     'remove_user_from_company',");
  console.log("     'get_unassigned_devices',");
  console.log("     'assign_device_to_company',");
  console.log("     'get_device_pool_stats'");
  console.log('   );');
  console.log('\n   Should return 6 rows.\n');
}

applyMigration().catch(console.error);
