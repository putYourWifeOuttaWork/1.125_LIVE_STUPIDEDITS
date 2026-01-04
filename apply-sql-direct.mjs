#!/usr/bin/env node

import pg from 'pg';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function applySql() {
  console.log('🔧 Applying SQL directly to database...\n');

  // Parse Supabase URL to get connection details
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  // Construct database URL
  // Supabase format: https://[project-ref].supabase.co
  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
  const dbUrl = `postgresql://postgres.${projectRef}:[password]@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

  console.log('⚠️  Database connection requires password.');
  console.log('Using environment variable if available...\n');

  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

  if (!connectionString) {
    console.log('❌ No DATABASE_URL found in environment');
    console.log('\n📋 Please apply the SQL manually:');
    console.log('1. Open https://supabase.com/dashboard/project/[project]/sql');
    console.log('2. Copy and paste the contents of: fix-comprehensive-snapshot-function.sql');
    console.log('3. Click "Run"');
    console.log('4. Then run: node regenerate-jan4-snapshots.mjs\n');
    return;
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    const sql = readFileSync('./fix-comprehensive-snapshot-function.sql', 'utf8');

    await client.query(sql);

    console.log('✅ SQL executed successfully!\n');

    // Test the function
    console.log('🧪 Testing function...\n');

    const testResult = await client.query(`
      SELECT generate_session_wake_snapshot(
        '4889eee2-6836-4f52-bbe4-9391e0930f88'::uuid,
        9999,
        '2026-01-04T23:59:00Z'::timestamptz,
        '2026-01-04T23:59:30Z'::timestamptz
      ) as snapshot_id
    `);

    const snapshotId = testResult.rows[0].snapshot_id;
    console.log('✅ Function test successful! Snapshot ID:', snapshotId);

    // Check structure
    const structureResult = await client.query(`
      SELECT site_state FROM session_wake_snapshots WHERE snapshot_id = $1
    `, [snapshotId]);

    const siteState = structureResult.rows[0].site_state;
    console.log('\n📊 Test snapshot site_state keys:');
    console.log(Object.keys(siteState));

    // Clean up
    await client.query('DELETE FROM session_wake_snapshots WHERE snapshot_id = $1', [snapshotId]);
    console.log('🧹 Test snapshot cleaned up\n');

    console.log('✅ All done! Ready to regenerate snapshots.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📋 Please apply manually via Supabase SQL Editor\n');
  } finally {
    await client.end();
  }
}

applySql().catch(console.error);
