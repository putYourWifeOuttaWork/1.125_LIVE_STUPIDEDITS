import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const sql = readFileSync('/tmp/fix_snapshot_locf.sql', 'utf8');

console.log('🔄 Applying LOCF snapshot fix migration...\n');

// Execute the full SQL
const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

if (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}

console.log('✅ Migration applied successfully!');
console.log('📝 Function generate_session_wake_snapshot() now uses LOCF');
console.log('');
console.log('🔍 KEY CHANGES:');
console.log('  - Telemetry query: captured_at <= wake_round_end (was: BETWEEN)');
console.log('  - MGI query: captured_at <= wake_round_end (was: BETWEEN)');
console.log('  - Devices now show LAST KNOWN state even if they did not wake');
console.log('');
console.log('⚠️  IMPORTANT: You must REGENERATE existing snapshots to apply LOCF!');
