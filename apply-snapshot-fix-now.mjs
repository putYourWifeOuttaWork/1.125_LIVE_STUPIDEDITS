import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const sql = fs.readFileSync('/tmp/snapshot_fix.sql', 'utf8');

console.log('📊 Applying snapshot generation fix...\n');

const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log('✅ Snapshot generation function updated!\n');
console.log('📋 Changes applied:');
console.log('  ✓ Queries device_wake_payloads for 3-hour windows');
console.log('  ✓ Calculates per-device metrics (latest & averages)');
console.log('  ✓ Computes velocities vs previous snapshot');
console.log('  ✓ Includes display properties for all 5 visual layers\n');
