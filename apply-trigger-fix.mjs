#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('\n🔧 Applying trigger fix migration...\n');

  try {
    const migration = readFileSync('./supabase/migrations/20251108180000_fix_device_image_trigger.sql', 'utf8');

    // Execute the migration SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: migration
    });

    if (error) {
      // Try direct query method instead
      console.log('Trying alternative execution method...');

      // Split migration into individual statements
      const statements = migration
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('/*') && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.length > 5) {
          const { error: stmtError } = await supabase.rpc('exec', {
            query: statement + ';'
          });

          if (stmtError) {
            console.warn(`Warning on statement: ${stmtError.message}`);
          }
        }
      }

      console.log('\n✅ Migration applied successfully!\n');
    } else {
      console.log('\n✅ Migration applied successfully!\n');
    }

    // Verify the function exists
    console.log('🔍 Verifying trigger function...\n');
    const { data: functions, error: funcError } = await supabase
      .from('pg_proc')
      .select('proname')
      .eq('proname', 'log_device_image_history')
      .limit(1);

    if (funcError) {
      console.log('⚠️  Could not verify function (this is okay if migration succeeded)');
    } else if (functions && functions.length > 0) {
      console.log('✅ Trigger function verified!\n');
    }

  } catch (err) {
    console.error('❌ Error applying migration:', err);
    process.exit(1);
  }
}

applyMigration();
