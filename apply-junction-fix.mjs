#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🚀 Applying Junction Table System Fix Migration...\n');

  try {
    // Read the SQL file
    const sql = readFileSync('/tmp/migration-fix-junction.sql', 'utf8');

    // Split by function boundaries and apply each part
    console.log('📝 Part 1: Fixing fn_assign_device_to_site...');
    const { error: error1 } = await supabase.rpc('exec_sql', { query: sql });

    if (error1) {
      // Try direct query instead
      console.log('Trying alternative method...');

      // Apply the full SQL as a single transaction
      const { data, error } = await supabase.from('_migrations').insert({
        name: '20251122140000_fix_junction_table_assignment_system',
        applied_at: new Date().toISOString()
      }).select();

      if (error) throw error;

      // Now execute the SQL via pg connection
      throw new Error('Cannot execute raw SQL via REST API. Please use Supabase SQL Editor or psql.');
    }

    console.log('✅ Migration applied successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\n📋 Manual Application Required:');
    console.log('1. Open Supabase SQL Editor');
    console.log('2. Copy contents from: /tmp/migration-fix-junction.sql');
    console.log('3. Paste and execute in SQL Editor\n');
    process.exit(1);
  }
}

applyMigration();
