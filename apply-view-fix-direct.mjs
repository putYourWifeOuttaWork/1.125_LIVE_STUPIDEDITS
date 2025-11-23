#!/usr/bin/env node
import pg from 'pg';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const client = new pg.Client({ connectionString: process.env.VITE_SUPABASE_DB_URL });

async function applyFix() {
  console.log('Applying session view fix for dynamic counts...\n');

  await client.connect();

  const sql = readFileSync('fix-session-views-dynamic-counts.sql', 'utf8');

  try {
    await client.query(sql);
    console.log('✓ View updated successfully!');
    console.log('\nVerifying counts are now dynamic...\n');

    const result = await client.query(`
      SELECT 
        session_id,
        session_date,
        expected_wake_count,
        completed_wake_count,
        failed_wake_count,
        extra_wake_count,
        total_wakes
      FROM vw_site_day_sessions
      WHERE session_date >= CURRENT_DATE - INTERVAL '2 days'
      ORDER BY session_date DESC
      LIMIT 3
    `);

    console.log('Sample session data with dynamic counts:');
    result.rows.forEach(s => {
      console.log(`\n  Date: ${s.session_date}`);
      console.log(`    Expected: ${s.expected_wake_count}`);
      console.log(`    Completed: ${s.completed_wake_count}`);
      console.log(`    Failed: ${s.failed_wake_count}`);
      console.log(`    Extra: ${s.extra_wake_count}`);
      console.log(`    Total: ${s.total_wakes}`);
    });

    console.log('\n✓ Fix applied! Session views now calculate counts dynamically from device_wake_payloads.');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyFix().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
