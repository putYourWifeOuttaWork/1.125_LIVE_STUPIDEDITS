import pg from 'pg';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Construct Supabase database URL
const dbUrl = `postgresql://postgres.jycxolmevsvrxmeinxff:${process.env.SUPABASE_DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

const client = new pg.Client({ connectionString: dbUrl });

try {
  await client.connect();
  console.log('✅ Connected to Supabase database');
  
  const sql = readFileSync('/tmp/phase3_part1_triggers.sql', 'utf8');
  console.log('📋 Executing Phase 3 Part 1 (Triggers)...\n');
  
  const result = await client.query(sql);
  console.log('✅ Triggers created successfully!');
  console.log('  - trg_increment_wake_count');
  console.log('  - trg_increment_image_count');
  console.log('  - trg_increment_alert_count');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error);
  process.exit(1);
} finally {
  await client.end();
}
