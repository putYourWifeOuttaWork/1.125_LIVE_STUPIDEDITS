#!/usr/bin/env node

/**
 * Script to apply RLS rebuild migrations to Supabase database
 *
 * This script applies the four migration files in sequence:
 * 1. 20251109130000_complete_rls_rebuild.sql
 * 2. 20251109130001_rls_policies_all_tables.sql
 * 3. 20251109130002_rls_policies_history_and_supporting.sql
 * 4. 20251109130003_remove_pilot_program_users.sql
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Supabase client with service role key for admin operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Migration files in order
const migrationFiles = [
  '20251109130000_complete_rls_rebuild.sql',
  '20251109130001_rls_policies_all_tables.sql',
  '20251109130002_rls_policies_history_and_supporting.sql',
  '20251109130003_remove_pilot_program_users.sql'
];

async function executeSqlFile(filename) {
  const filepath = join(__dirname, 'supabase', 'migrations', filename);

  console.log(`\n📄 Reading ${filename}...`);

  try {
    const sql = readFileSync(filepath, 'utf-8');

    console.log(`✓ File loaded (${sql.length} characters)`);
    console.log(`🔄 Executing migration...`);

    // Execute the SQL using Supabase RPC
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // If exec_sql RPC doesn't exist, try direct query
      if (error.message && error.message.includes('exec_sql')) {
        console.log('  ⚠️  exec_sql RPC not found, trying direct execution...');

        // For direct execution, we need to split and execute statements
        // This is a simplified approach - better to use proper SQL parser
        const { error: directError } = await supabase.from('_placeholder').select('1').limit(0);

        if (directError) {
          throw new Error(`Cannot execute SQL directly: ${directError.message}`);
        }

        console.log('  ℹ️  Direct execution not supported for complex migrations');
        console.log('  ℹ️  Please apply this migration manually using Supabase Studio or psql');
        return { manual: true };
      }

      throw error;
    }

    console.log(`✅ ${filename} applied successfully`);
    return { success: true };

  } catch (error) {
    console.error(`❌ Error applying ${filename}:`);
    console.error(error.message || error);
    return { error };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  RLS REBUILD MIGRATION APPLICATION');
  console.log('='.repeat(70));
  console.log();
  console.log('⚠️  WARNING: This will completely rebuild the RLS system!');
  console.log('   - All existing RLS policies will be dropped');
  console.log('   - pilot_program_users table will be removed');
  console.log('   - New role-based access control will be implemented');
  console.log();
  console.log(`📡 Connected to: ${supabaseUrl}`);
  console.log();

  // Wait for confirmation (in production, you'd want actual user confirmation)
  console.log('🚀 Starting migration process...');

  const results = [];
  let manualRequired = false;

  for (const filename of migrationFiles) {
    const result = await executeSqlFile(filename);
    results.push({ filename, ...result });

    if (result.manual) {
      manualRequired = true;
      break;
    }

    if (result.error) {
      console.log('\n❌ Migration failed. Stopping.');
      break;
    }

    // Small delay between migrations
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(70));
  console.log('  MIGRATION RESULTS');
  console.log('='.repeat(70) + '\n');

  results.forEach(({ filename, success, error, manual }) => {
    if (success) {
      console.log(`✅ ${filename} - SUCCESS`);
    } else if (manual) {
      console.log(`⚠️  ${filename} - MANUAL APPLICATION REQUIRED`);
    } else if (error) {
      console.log(`❌ ${filename} - FAILED`);
    }
  });

  if (manualRequired) {
    console.log('\n' + '='.repeat(70));
    console.log('  MANUAL MIGRATION REQUIRED');
    console.log('='.repeat(70));
    console.log('\nPlease apply the migrations manually using one of these methods:');
    console.log('\n1. Supabase Studio SQL Editor:');
    console.log(`   - Go to ${supabaseUrl.replace('https://', 'https://supabase.com/dashboard/project/')}/sql/new`);
    console.log('   - Copy and paste each migration file content');
    console.log('   - Execute in order');
    console.log('\n2. Using psql command line:');
    console.log('   psql <your-connection-string> -f supabase/migrations/20251109130000_complete_rls_rebuild.sql');
    console.log('   psql <your-connection-string> -f supabase/migrations/20251109130001_rls_policies_all_tables.sql');
    console.log('   psql <your-connection-string> -f supabase/migrations/20251109130002_rls_policies_history_and_supporting.sql');
    console.log('   psql <your-connection-string> -f supabase/migrations/20251109130003_remove_pilot_program_users.sql');
  }

  console.log('\n' + '='.repeat(70));

  const allSuccess = results.every(r => r.success);
  const anyFailed = results.some(r => r.error);

  if (allSuccess) {
    console.log('✅ All migrations applied successfully!');
    console.log('\nNext steps:');
    console.log('1. Run: node verify-rls-setup.mjs');
    console.log('2. Assign user roles to existing users');
    console.log('3. Test access with different user roles');
    console.log('4. Update frontend code to remove pilot_program_users references');
  } else if (anyFailed) {
    console.log('❌ Migration process failed. Check errors above.');
    console.log('\nRollback available at: supabase/RLS_REBUILD_ROLLBACK.sql');
  } else if (manualRequired) {
    console.log('⚠️  Manual migration required. See instructions above.');
  }

  process.exit(anyFailed ? 1 : 0);
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
