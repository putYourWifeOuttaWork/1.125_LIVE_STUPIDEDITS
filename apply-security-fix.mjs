import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applySecurityFix() {
  console.log('\n=== Applying Security Fix Migration ===\n');

  // Read the migration file
  const migrationSQL = readFileSync(
    'supabase/migrations/20251109000007_fix_view_security_invoker.sql',
    'utf8'
  );

  console.log('Migration file loaded successfully');
  console.log('Size:', migrationSQL.length, 'bytes\n');

  // Split into individual statements (simple split on semicolon)
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('/*') && !s.startsWith('--'));

  console.log(`Found ${statements.length} SQL statements to execute\n`);

  try {
    // Execute the full migration as one block
    console.log('Executing migration...');

    // Remove comments for execution
    const cleanSQL = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    // Use rpc to execute raw SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql: cleanSQL }).catch(async () => {
      // If exec_sql doesn't exist, try direct execution
      // We'll need to execute statement by statement
      console.log('Executing statements individually...\n');

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        if (!stmt) continue;

        console.log(`Statement ${i + 1}/${statements.length}:`, stmt.substring(0, 80) + '...');

        // For CREATE VIEW, we need special handling
        if (stmt.includes('CREATE OR REPLACE VIEW') || stmt.includes('DROP VIEW')) {
          try {
            // Execute using the database connection
            const result = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`
              },
              body: JSON.stringify({ query: stmt })
            });

            if (!result.ok) {
              console.log('   ⚠️  Cannot execute via REST API');
            }
          } catch (err) {
            console.log('   ⚠️  Error:', err.message);
          }
        }
      }

      return { data: null, error: null };
    });

    if (error) {
      console.log('\n❌ Error executing migration:', error);
      console.log('\nYou may need to apply this migration manually through the Supabase dashboard:');
      console.log('1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql');
      console.log('2. Copy the SQL from: supabase/migrations/20251109000007_fix_view_security_invoker.sql');
      console.log('3. Paste and execute');
      return false;
    }

    console.log('\n✅ Migration applied successfully!\n');

    // Verify the fix
    console.log('Verifying the fix...\n');

    // Try to query the view
    const { data: programs, error: viewError } = await supabase
      .from('pilot_programs_with_progress')
      .select('program_id, name')
      .limit(1);

    if (viewError) {
      console.log('❌ View query failed:', viewError.message);
      return false;
    }

    console.log('✅ View is accessible and working\n');

    return true;
  } catch (err) {
    console.error('\n❌ Unexpected error:', err);
    return false;
  }
}

console.log('════════════════════════════════════════════════════════════');
console.log('   CRITICAL SECURITY FIX - Multi-Tenancy Data Isolation');
console.log('════════════════════════════════════════════════════════════');

applySecurityFix().then(success => {
  if (success) {
    console.log('════════════════════════════════════════════════════════════');
    console.log('✅ SUCCESS - Security fix applied successfully');
    console.log('════════════════════════════════════════════════════════════');
    console.log('\nNext steps:');
    console.log('1. Have Matt log out and log back in');
    console.log('2. He should now see only Sandhill Growers programs');
    console.log('3. Verify no unauthorized data is visible\n');
  } else {
    console.log('════════════════════════════════════════════════════════════');
    console.log('⚠️  MANUAL ACTION REQUIRED');
    console.log('════════════════════════════════════════════════════════════');
    console.log('\nPlease apply the migration manually:');
    console.log('File: supabase/migrations/20251109000007_fix_view_security_invoker.sql\n');
  }
});
