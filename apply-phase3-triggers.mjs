import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

console.log('Reading Phase 3 Part 1: Triggers...\n');
const sql = readFileSync('/tmp/phase3_part1_triggers.sql', 'utf8');

const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log('Executing ' + statements.length + ' SQL statements...\n');

for (let idx = 0; idx < statements.length; idx++) {
  const stmt = statements[idx] + ';';
  const preview = stmt.substring(0, 60).replace(/\n/g, ' ');
  console.log((idx + 1) + '/' + statements.length + ': ' + preview + '...');
  
  try {
    const result = await supabase.rpc('exec_sql', { sql_query: stmt });
    if (result.error) throw result.error;
  } catch (err) {
    console.error('\nError on statement ' + (idx + 1) + ':', err.message);
    process.exit(1);
  }
}

console.log('\nAll triggers created successfully!');
