#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  'https://jycxolmevsvrxmeinxff.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzMTQzNiwiZXhwIjoyMDY2NzA3NDM2fQ.RSZ2H5dccCwE1C58hq-DqKehHcnoaRBO0AhPQZ54gAI',
  {
    db: { schema: 'public' },
    auth: { persistSession: false }
  }
);

console.log('🔧 Applying fn_wake_ingestion_handler fix...\n');

const sql = readFileSync('FIX_DEVICE_IMAGES_INSERT.sql', 'utf8');

// Remove comments and split into statements
const cleanSql = sql
  .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
  .replace(/--.*$/gm, ''); // Remove -- comments

try {
  // Execute the CREATE OR REPLACE FUNCTION statement
  const { data, error } = await supabase
    .from('_') // Dummy table to get access to raw SQL
    .select('*')
    .limit(0);

  // Since we can't execute raw SQL via REST API, we need to use PostgreSQL connection
  // Let's use the pg library instead

  const { default: pg } = await import('pg');
  const { Client } = pg;

  const client = new Client({
    connectionString: 'postgresql://postgres.jycxolmevsvrxmeinxff:BoltGeneratedSupabasePassword2024!@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  console.log('✅ Connected to database');
  console.log('📝 Executing function update...\n');

  const result = await client.query(cleanSql);

  console.log('✅ fn_wake_ingestion_handler updated successfully!\n');
  console.log('Changes applied:');
  console.log('  ✅ Added program_id to INSERT');
  console.log('  ✅ Added site_id to INSERT');
  console.log('  ✅ Added site_device_session_id to INSERT');
  console.log('  ✅ Added ON CONFLICT DO UPDATE for these columns\n');
  console.log('🧪 Test with device message now!');

  await client.end();

} catch (err) {
  console.error('❌ Error applying fix:', err.message);
  console.log('\n📋 Manual application required:');
  console.log('1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new');
  console.log('2. Paste contents of FIX_DEVICE_IMAGES_INSERT.sql');
  console.log('3. Click "Run"');
  process.exit(1);
}
