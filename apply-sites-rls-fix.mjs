import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

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
  console.log('=== APPLYING SITES RLS FIX MIGRATION ===\n');

  try {
    // Read the migration file
    const migrationSQL = fs.readFileSync('./supabase/migrations/20251109120000_fix_sites_rls_admin_access.sql', 'utf8');

    console.log('📄 Migration file loaded');
    console.log('🔧 Applying migration to database...\n');

    // Split the SQL into individual statements and execute them
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('/*') && !s.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      if (statement.includes('SELECT') && statement.includes('status')) {
        // Skip status messages
        continue;
      }

      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });

      if (error) {
        console.error(`❌ Error executing statement:`, error.message);
        console.error(`   Statement: ${statement.substring(0, 100)}...`);
        errorCount++;
      } else {
        successCount++;
      }
    }

    console.log('\n=== MIGRATION COMPLETE ===');
    console.log(`✓ Successful statements: ${successCount}`);

    if (errorCount > 0) {
      console.log(`❌ Failed statements: ${errorCount}`);
      console.log('\n⚠️  Migration completed with errors. Some policies may not have been updated.');
    } else {
      console.log('✓ All policies updated successfully!');
      console.log('\n🎉 Sites should now be visible to admin and super admin users!');
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

applyMigration();
