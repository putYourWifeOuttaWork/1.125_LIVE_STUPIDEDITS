#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyFix() {
  console.log('Applying session view fix for dynamic counts...\n');

  const sql = readFileSync('fix-session-views-dynamic-counts.sql', 'utf8');

  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.error('Error applying fix:', error);
    process.exit(1);
  }

  console.log('✓ View updated successfully!');
  console.log('\nVerifying counts are now dynamic...\n');

  // Test the view
  const { data: sessions, error: queryError } = await supabase
    .from('vw_site_day_sessions')
    .select('session_id, session_date, expected_wake_count, completed_wake_count, failed_wake_count, extra_wake_count, total_wakes')
    .order('session_date', { ascending: false })
    .limit(3);

  if (queryError) {
    console.error('Error querying view:', queryError);
    process.exit(1);
  }

  console.log('Sample session data with dynamic counts:');
  sessions?.forEach(s => {
    console.log(`\n  Date: ${s.session_date}`);
    console.log(`    Expected: ${s.expected_wake_count}`);
    console.log(`    Completed: ${s.completed_wake_count}`);
    console.log(`    Failed: ${s.failed_wake_count}`);
    console.log(`    Extra: ${s.extra_wake_count}`);
    console.log(`    Total: ${s.total_wakes}`);
  });

  console.log('\n✓ Fix applied! Session views now calculate counts dynamically from device_wake_payloads.');
}

applyFix().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
