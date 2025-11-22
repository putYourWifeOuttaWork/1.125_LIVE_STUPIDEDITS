#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function executeSql(description, sql) {
  console.log(`\n📝 ${description}...`);

  // Use the database connection to execute raw SQL
  const { data, error } = await supabase.rpc('exec', { sql });

  if (error) {
    // If exec doesn't exist, we need manual execution
    console.log(`⚠️  Cannot execute via API: ${error.message}`);
    console.log(`\n📋 Please execute this SQL manually in Supabase SQL Editor:`);
    console.log('─'.repeat(80));
    console.log(sql.substring(0, 500) + '...');
    console.log('─'.repeat(80));
    return false;
  }

  console.log(`✅ ${description} complete`);
  return true;
}

async function applyMigration() {
  console.log('🚀 Applying Junction Table System Fix Migration\n');
  console.log('Migration file: /tmp/migration-fix-junction.sql\n');
  console.log('═'.repeat(80));
  console.log('\n📖 This migration will:');
  console.log('   1. Fix fn_assign_device_to_site to create junction records');
  console.log('   2. Fix fn_remove_device_from_site to deactivate junctions');
  console.log('   3. Create auto-sync triggers');
  console.log('   4. Backfill ~5 devices with missing junction records');
  console.log('\n═'.repeat(80));

  try {
    // Read the full SQL
    const fullSql = readFileSync('/tmp/migration-fix-junction.sql', 'utf8');

    // Check if we can execute SQL directly
    console.log('\n🔍 Checking database access method...');

    const { data: functions, error: fnError } = await supabase
      .rpc('version', {});

    if (fnError) {
      console.log('\n⚠️  Direct SQL execution not available via REST API.');
      console.log('\n📋 MANUAL APPLICATION REQUIRED:\n');
      console.log('1. Open Supabase Dashboard → SQL Editor');
      console.log('2. Create new query');
      console.log('3. Copy the migration from: /tmp/migration-fix-junction.sql');
      console.log('4. Paste and click "Run"\n');
      console.log('Migration content:');
      console.log('─'.repeat(80));
      console.log(fullSql);
      console.log('─'.repeat(80));
      console.log('\nAfter applying, run: node verify-junction-fix.mjs\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n📋 MANUAL APPLICATION REQUIRED:\n');
    console.log('Please apply the migration manually using Supabase SQL Editor.');
    console.log('\nMigration file location:');
    console.log('   /tmp/migration-fix-junction.sql\n');
    console.log('Steps:');
    console.log('1. cat /tmp/migration-fix-junction.sql');
    console.log('2. Copy the output');
    console.log('3. Paste into Supabase SQL Editor');
    console.log('4. Click "Run"\n');
    process.exit(1);
  }
}

applyMigration();
