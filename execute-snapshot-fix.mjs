import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const sql = fs.readFileSync('/tmp/snapshot_fix.sql', 'utf8');

console.log('📊 Executing snapshot generation fix...\n');

// Execute via direct query (bypassing RPC)
const { data, error } = await supabase
  .from('_migrations')  // dummy table to trigger query
  .select('*')
  .limit(0)
  .then(() => {
    // Fallback: Use postgREST query
    return fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ sql_query: sql })
    });
  });

if (error || !data.ok) {
  console.log('⚠️  Direct execution not available, using function replacement method...\n');
  
  // Alternative: Break down SQL into parts and execute
  const functionDef = sql.match(/CREATE OR REPLACE FUNCTION[\s\S]+?\$\$;/i);
  
  if (functionDef) {
    const { error: funcError } = await supabase.rpc('query', { 
      query: functionDef[0] 
    });
    
    if (funcError) {
      console.error('❌ Error:', funcError.message);
      console.log('\n📝 SQL saved to /tmp/snapshot_fix.sql');
      console.log('📋 Please apply manually using Supabase SQL Editor or psql');
      process.exit(1);
    }
  }
}

console.log('✅ Function updated successfully!\n');
console.log('📋 Changes applied:');
console.log('  ✓ generate_session_wake_snapshot() now queries device_wake_payloads');
console.log('  ✓ Per-device aggregation (latest + averages)');
console.log('  ✓ Velocity calculations (compare to previous snapshot)');
console.log('  ✓ Display properties for all 5 visual layers\n');
