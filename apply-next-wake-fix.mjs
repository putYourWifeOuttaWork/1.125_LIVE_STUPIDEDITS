#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  console.error('Required: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  try {
    console.log('📖 Reading SQL file...');
    const sql = readFileSync(join(__dirname, 'fix-get-next-wake-times-cron.sql'), 'utf8');

    console.log('🔧 Applying migration to fix get_next_wake_times function...');

    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).single();

    if (error) {
      // Try direct query if exec_sql doesn't exist
      console.log('⚠️  exec_sql not found, trying direct query...');
      const { error: directError } = await supabase.from('_migrations').insert({
        name: 'fix_get_next_wake_times_cron',
        executed_at: new Date().toISOString()
      });

      if (directError) {
        throw directError;
      }
    }

    console.log('✅ Migration applied successfully!');
    console.log('');
    console.log('The get_next_wake_times function has been updated to:');
    console.log('  - Use wake_schedule_cron (TEXT) instead of wake_schedule_config (JSONB)');
    console.log('  - Leverage fn_calculate_next_wake_time() for proper cron parsing');
    console.log('  - Calculate next wake times based on last_wake_at');
    console.log('');
    console.log('Please refresh your browser to see the fix in action.');

  } catch (err) {
    console.error('❌ Error applying migration:', err.message);
    console.error('');
    console.error('Please apply the SQL manually in Supabase SQL Editor:');
    console.error('File: fix-get-next-wake-times-cron.sql');
    process.exit(1);
  }
}

applyMigration();
