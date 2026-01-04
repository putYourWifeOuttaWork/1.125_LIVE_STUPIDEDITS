#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});

const sql = readFileSync('fix-get-next-wake-times-cron.sql', 'utf8');

console.log('🔧 Applying fix to get_next_wake_times function...\n');

// Split SQL into individual statements
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

let successCount = 0;
let failCount = 0;

for (const statement of statements) {
  if (statement.length === 0) continue;

  try {
    const { error } = await supabase.rpc('exec_sql', { sql_text: statement + ';' });

    if (error) {
      console.log(`⚠️  Statement failed (this is expected, will apply manually)`);
      failCount++;
    } else {
      successCount++;
    }
  } catch (err) {
    failCount++;
  }
}

if (failCount > 0) {
  console.log('❌ Cannot execute SQL via Supabase API\n');
  console.log('📋 Please apply the fix manually:\n');
  console.log('1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new');
  console.log('2. Copy the contents of fix-get-next-wake-times-cron.sql');
  console.log('3. Click "Run"\n');
  console.log('The fix will:');
  console.log('  ✅ Use wake_schedule_cron (TEXT) instead of wake_schedule_config (JSONB)');
  console.log('  ✅ Leverage fn_calculate_next_wake_time() for cron parsing');
  console.log('  ✅ Calculate next wake times based on last_wake_at\n');
  process.exit(1);
} else {
  console.log('✅ Fix applied successfully!');
  console.log('\n🎉 The get_next_wake_times function has been updated.');
  console.log('Please refresh your browser to see the fix in action.');
}
