import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  'https://jycxolmevsvrxmeinxff.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzMTQzNiwiZXhwIjoyMDY2NzA3NDM2fQ.RSZ2H5dccCwE1C58hq-DqKehHcnoaRBO0AhPQZ54gAI'
);

async function applyPatch() {
  console.log('Applying patch migration...\n');

  const sql = readFileSync('./supabase/migrations/20251111130001_fix_mock_generator_device_type.sql', 'utf8');

  console.log('Migration file loaded. Contents:');
  console.log('=' .repeat(60));
  console.log('This migration fixes the device_type column error.');
  console.log('Please apply via Supabase Dashboard SQL editor.');
  console.log('=' .repeat(60));
  console.log('\n');

  // Test the fixed function
  console.log('Testing fixed function...\n');

  const { data: result, error } = await supabase
    .rpc('fn_generate_mock_unmapped_device', {
      p_device_name: 'Test Mock Device',
      p_wake_schedule_cron: '0 */3 * * *'
    });

  if (error) {
    console.error('❌ Error (function needs to be updated in database):', error.message);
    console.log('\n📋 To fix, copy and run this SQL in Supabase Dashboard:');
    console.log('=' .repeat(60));
    console.log(sql);
    console.log('=' .repeat(60));
  } else {
    console.log('✅ Success! Mock device created:');
    console.log(JSON.stringify(result, null, 2));
  }
}

applyPatch().catch(console.error);
