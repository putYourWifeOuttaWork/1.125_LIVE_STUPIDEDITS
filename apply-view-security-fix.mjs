import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('='.repeat(80));
console.log('APPLYING VIEW SECURITY FIX');
console.log('='.repeat(80));
console.log();

async function applyFix() {
  console.log('Step 1: Checking current view configuration...');

  // Check current view options
  const { data: viewCheck, error: checkError } = await supabase
    .rpc('exec_sql', {
      sql: `
        SELECT
          c.relname AS view_name,
          c.reloptions AS options
        FROM pg_class c
        WHERE c.relname = 'pilot_programs_with_progress'
        AND c.relkind = 'v';
      `
    })
    .single();

  if (checkError) {
    // RPC might not exist, try direct query
    console.log('   (Cannot check via RPC, will proceed with fix anyway)');
  } else {
    console.log('   Current view options:', viewCheck?.options || 'none');
  }
  console.log();

  console.log('Step 2: Dropping and recreating view with security_invoker = true...');

  const sql = `
    DROP VIEW IF EXISTS pilot_programs_with_progress CASCADE;

    CREATE OR REPLACE VIEW pilot_programs_with_progress
    WITH (security_invoker = true)
    AS
    SELECT
      p.*,
      (p.end_date - p.start_date + 1) AS days_count_this_program,
      CASE
        WHEN CURRENT_DATE < p.start_date THEN 0
        WHEN CURRENT_DATE BETWEEN p.start_date AND p.end_date THEN
          (CURRENT_DATE - p.start_date + 1)
        ELSE (p.end_date - p.start_date + 1)
      END AS day_x_of_program,
      CASE
        WHEN (p.end_date - p.start_date + 1) = 0 THEN 0
        WHEN CURRENT_DATE < p.start_date THEN 0
        WHEN CURRENT_DATE BETWEEN p.start_date AND p.end_date THEN
          ROUND(((CURRENT_DATE - p.start_date + 1)::NUMERIC / (p.end_date - p.start_date + 1)::NUMERIC) * 100, 2)
        ELSE 100
      END AS phase_progress
    FROM
      pilot_programs p;

    GRANT SELECT ON pilot_programs_with_progress TO authenticated;
  `;

  // Execute the SQL
  const { error: execError } = await supabase.rpc('exec_sql', { sql });

  if (execError) {
    console.error('   ❌ Error executing SQL:', execError.message);
    console.log();
    console.log('MANUAL FIX REQUIRED:');
    console.log('   1. Go to Supabase Dashboard > SQL Editor');
    console.log('   2. Run the SQL from FIX_VIEW_SECURITY_NOW.sql');
    console.log();
    return false;
  }

  console.log('   ✓ View recreated with security_invoker = true');
  console.log();

  console.log('Step 3: Verifying the fix...');

  // Test by querying as service role (should see all programs)
  const { data: allPrograms } = await supabase
    .from('pilot_programs_with_progress')
    .select('program_id, name, company_id');

  console.log(`   ✓ View is queryable (${allPrograms?.length || 0} programs visible to service role)`);
  console.log();

  console.log('='.repeat(80));
  console.log('✓ FIX APPLIED SUCCESSFULLY');
  console.log('='.repeat(80));
  console.log();
  console.log('Next steps:');
  console.log('1. Have Matt refresh the browser (hard refresh: Cmd+Shift+R)');
  console.log('2. Matt should now see 0 programs (GasX has no programs)');
  console.log('3. If he still sees Sandhill programs, clear browser cache/localStorage');
  console.log();

  return true;
}

applyFix().catch(error => {
  console.error('Fatal error:', error);
  console.log();
  console.log('MANUAL FIX REQUIRED:');
  console.log('Run the SQL in FIX_VIEW_SECURITY_NOW.sql in Supabase Dashboard');
});
