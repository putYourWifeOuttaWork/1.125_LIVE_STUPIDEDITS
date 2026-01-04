import pg from 'pg';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = `postgresql://postgres.jycxolmevsvrxmeinxff:${process.env.SUPABASE_DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

const client = new pg.Client({ connectionString: dbUrl });

try {
  await client.connect();
  console.log('✅ Connected to Supabase database');

  const sql = readFileSync('/tmp/next_wake_times_migration.sql', 'utf8');
  console.log('📋 Applying get_next_wake_times function migration...\n');

  await client.query(sql);
  console.log('✅ Migration applied successfully!');
  console.log('  - get_next_wake_times(uuid, integer) function created');
  console.log('  - Returns next N wake times with timezone info');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error);
  process.exit(1);
} finally {
  await client.end();
}
