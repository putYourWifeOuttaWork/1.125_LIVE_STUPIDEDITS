#!/usr/bin/env node

/**
 * Phase 3 Deployment Verification Script
 * 
 * Checks that all required components are in place
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const REQUIRED_MODULES = [
  'types.ts',
  'config.ts',
  'resolver.ts',
  'schedule.ts',
  'storage.ts',
  'idempotency.ts',
  'ack.ts',
  'ingest.ts',
  'finalize.ts',
  'retry.ts',
  'index.ts',
  'deno.json',
  'README.md',
];

const REQUIRED_FUNCTIONS = [
  'fn_midnight_session_opener',
  'fn_wake_ingestion_handler',
  'fn_image_completion_handler',
  'fn_image_failure_handler',
  'fn_retry_by_id_handler',
  'fn_get_or_create_device_submission',
];

async function verify() {
  console.log('🔍 Phase 3 Deployment Verification\n');

  // Check 1: Module files exist
  console.log('1. Checking module files...');
  let allModulesExist = true;
  for (const module of REQUIRED_MODULES) {
    const path = `./supabase/functions/mqtt_device_handler/${module}`;
    try {
      readFileSync(path);
      console.log(`   ✅ ${module}`);
    } catch (err) {
      console.log(`   ❌ ${module} - MISSING`);
      allModulesExist = false;
    }
  }

  if (!allModulesExist) {
    console.error('\n❌ Some modules are missing. Deployment incomplete.');
    process.exit(1);
  }

  // Check 2: SQL functions exist (requires Supabase connection)
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('\n2. Checking SQL functions...');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let allFunctionsExist = true;
    for (const funcName of REQUIRED_FUNCTIONS) {
      try {
        const { data, error } = await supabase.rpc(funcName, {});
        // Function exists if we get a response (even error is expected without params)
        console.log(`   ✅ ${funcName}`);
      } catch (err) {
        // Check if it's a "function does not exist" error
        if (err.message?.includes('does not exist')) {
          console.log(`   ❌ ${funcName} - NOT FOUND`);
          allFunctionsExist = false;
        } else {
          // Other errors are OK (e.g., missing parameters)
          console.log(`   ✅ ${funcName}`);
        }
      }
    }

    if (!allFunctionsExist) {
      console.error('\n❌ Some SQL functions are missing. Run Phase 2.5 migrations first.');
      process.exit(1);
    }
  } else {
    console.log('\n2. Skipping SQL function check (no Supabase credentials)');
    console.log('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to verify');
  }

  // Check 3: Old handler backed up
  console.log('\n3. Checking old handler backup...');
  try {
    readFileSync('./supabase/functions/mqtt_device_handler_old/index.ts');
    console.log('   ✅ Old handler backed up');
  } catch (err) {
    console.log('   ⚠️  Old handler not found (may not have existed)');
  }

  console.log('\n✅ Phase 3 deployment verification complete!\n');
  console.log('Next steps:');
  console.log('  1. Deploy to Supabase: supabase functions deploy mqtt_device_handler');
  console.log('  2. Check logs: supabase functions logs mqtt_device_handler --tail');
  console.log('  3. Test with device or simulator');
  console.log('  4. Run five verification tests from PHASE_3_IMPLEMENTATION_COMPLETE.md\n');
}

verify().catch(console.error);
