#!/usr/bin/env node
import pg from 'pg';
import { readFileSync } from 'fs';

const { Client } = pg;

const connectionString = process.env.SUPABASE_DB_URL ||
  'postgresql://postgres.jycxolmevsvrxmeinxff:[YOUR-DB-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

const sql = readFileSync('fix_trigger_missing_columns.sql', 'utf8');

console.log('🔧 Applying trigger fix...\n');

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  console.log('✅ Connected to database\n');

  await client.query(sql);

  console.log('✅ Trigger function updated successfully!\n');
  console.log('Changes:');
  console.log('  ✅ Added TRY-EXCEPT blocks for each column check');
  console.log('  ✅ Handles missing columns gracefully (no more crashes)');
  console.log('  ✅ Still inherits values when columns ARE present\n');
  console.log('🧪 Test your device message now - should work!');

  await client.end();
  process.exit(0);

} catch (err) {
  console.error('❌ Error:', err.message);
  console.log('\n📋 Please apply manually via Supabase Dashboard:');
  console.log('https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new');
  console.log('\nPaste contents of: fix_trigger_missing_columns.sql');
  process.exit(1);
}
