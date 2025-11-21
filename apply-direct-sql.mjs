import pg from 'pg';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not found in .env');
  process.exit(1);
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  console.log('✅ Connected to database\n');
  
  const sql = fs.readFileSync('/tmp/snapshot_fix.sql', 'utf8');
  
  console.log('📊 Applying snapshot generation fix...\n');
  
  await client.query(sql);
  
  console.log('✅ Migration applied successfully!\n');
  console.log('📋 Function updated: generate_session_wake_snapshot()');
  console.log('  ✓ Now queries device_wake_payloads');
  console.log('  ✓ Calculates per-device metrics');
  console.log('  ✓ Includes velocity calculations');
  console.log('  ✓ Pre-calculates all 5 visual layer colors\n');
  
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
