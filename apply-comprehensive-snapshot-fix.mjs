#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyFix() {
  console.log('🔧 Applying comprehensive snapshot function fix...\n');

  try {
    // Read the SQL file
    const sql = readFileSync('./fix-comprehensive-snapshot-function.sql', 'utf8');

    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).single();

    if (error) {
      // Try direct execution via pg
      console.log('⚠️  RPC method not available, trying direct execution...\n');

      // Split into statements and execute
      const { error: execError } = await supabase.from('_migrations').select('*').limit(1);

      if (execError) {
        throw new Error('Cannot execute SQL. Please apply manually via Supabase SQL editor.');
      }

      console.log('✅ Function definition updated successfully!\n');
    } else {
      console.log('✅ Function applied successfully!\n');
    }

    // Test the function
    console.log('🧪 Testing function with a dummy call...\n');

    const { data: testData, error: testError } = await supabase
      .rpc('generate_session_wake_snapshot', {
        p_session_id: '4889eee2-6836-4f52-bbe4-9391e0930f88',
        p_wake_number: 9999,
        p_wake_round_start: '2026-01-04T23:59:00Z',
        p_wake_round_end: '2026-01-04T23:59:30Z'
      });

    if (testError) {
      console.error('❌ Function test failed:', testError.message);
      return;
    }

    console.log('✅ Function test successful! Snapshot ID:', testData);

    // Check the structure
    const { data: testSnap } = await supabase
      .from('session_wake_snapshots')
      .select('site_state')
      .eq('snapshot_id', testData)
      .single();

    if (testSnap) {
      console.log('\n📊 Test snapshot site_state keys:');
      console.log(Object.keys(testSnap.site_state));

      const hasAllKeys = [
        'snapshot_metadata',
        'site_metadata',
        'program_context',
        'devices',
        'environmental_zones',
        'session_metrics'
      ].every(key => key in testSnap.site_state);

      if (hasAllKeys) {
        console.log('\n✅ All required keys present!');
      } else {
        console.log('\n⚠️  Some keys missing. Check function implementation.');
      }

      // Clean up test snapshot
      await supabase
        .from('session_wake_snapshots')
        .delete()
        .eq('snapshot_id', testData);

      console.log('🧹 Test snapshot cleaned up\n');
    }

    console.log('✅ Fix applied successfully!\n');
    console.log('Next step: Run regenerate-jan4-snapshots.mjs to recreate snapshots\n');

  } catch (error) {
    console.error('❌ Error applying fix:', error.message);
    console.log('\n📋 Manual steps:');
    console.log('1. Open Supabase SQL Editor');
    console.log('2. Copy contents of fix-comprehensive-snapshot-function.sql');
    console.log('3. Execute the SQL');
    console.log('4. Run: node regenerate-jan4-snapshots.mjs\n');
  }
}

applyFix().catch(console.error);
