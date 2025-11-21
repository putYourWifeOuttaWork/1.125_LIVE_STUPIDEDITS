#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applySnapshotFix() {
  console.log('🔨 Applying snapshot generation fix...\n');

  const sql = readFileSync('./fix-snapshot-generation-latest-data.sql', 'utf8');

  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    // Try direct execution if exec_sql doesn't exist
    const { error: directError } = await supabase.from('_sql').insert({ query: sql });

    if (directError) {
      console.error('❌ Error applying fix:', error);
      console.log('\n📋 Please apply this SQL manually in Supabase SQL Editor:\n');
      console.log(sql);
      return false;
    }
  }

  console.log('✅ Snapshot generation function updated!\n');
  console.log('📝 Changes:');
  console.log('   - Telemetry: Uses LATEST data AS OF wake time (was: data DURING wake)');
  console.log('   - MGI: Uses LATEST data AS OF wake time (was: data DURING wake)');
  console.log('   - This ensures snapshots show device state even when devices report asynchronously\n');

  return true;
}

applySnapshotFix().then((success) => {
  if (success) {
    console.log('✅ Ready to regenerate snapshots with: node generate-snapshots-for-site.mjs');
  }
  process.exit(success ? 0 : 1);
});
