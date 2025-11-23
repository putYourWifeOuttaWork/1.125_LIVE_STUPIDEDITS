#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://jycxolmevsvrxmeinxff.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzMTQzNiwiZXhwIjoyMDY2NzA3NDM2fQ.RSZ2H5dccCwE1C58hq-DqKehHcnoaRBO0AhPQZ54gAI';

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});

const sql = readFileSync('FIX_DEVICE_IMAGES_INSERT.sql', 'utf8');

console.log('🔧 Applying fix to fn_wake_ingestion_handler...\n');

try {
  // Execute using raw SQL
  const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql })
    .catch(() => {
      // If exec_sql doesn't exist, try direct query
      return supabase.from('_').select('*').limit(0).then(() => {
        // This won't work, but let's try pg_stat_statements approach
        throw new Error('No RPC available');
      });
    });

  if (error) {
    console.error('❌ Error:', error);
    console.log('\n📋 Please apply the SQL manually in Supabase Dashboard:\n');
    console.log('1. Go to https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql');
    console.log('2. Paste the contents of FIX_DEVICE_IMAGES_INSERT.sql');
    console.log('3. Click "Run"');
    process.exit(1);
  }

  console.log('✅ Fix applied successfully!');
} catch (err) {
  console.error('❌ Cannot execute SQL via API');
  console.log('\n📋 Please apply FIX_DEVICE_IMAGES_INSERT.sql manually:\n');
  console.log('1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new');
  console.log('2. Copy and paste the contents of FIX_DEVICE_IMAGES_INSERT.sql');
  console.log('3. Click "Run"\n');
  console.log('The fix adds these columns to the INSERT statement:');
  console.log('  ✅ program_id (from lineage resolution)');
  console.log('  ✅ site_id (from lineage resolution)');
  console.log('  ✅ site_device_session_id (from session lookup/create)\n');
  process.exit(1);
}
