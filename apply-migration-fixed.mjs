import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

console.log('Reading migration file...');
const sql = readFileSync('./supabase/migrations/20251109160000_user_management_and_device_pool.sql', 'utf8');

console.log('Executing migration via Supabase client...');
console.log('This may take a moment...\n');

// Split into individual statements for better error reporting
const statements = sql
  .split(/;\s*(?=CREATE|DROP|ALTER|GRANT|COMMENT|UPDATE|DO)/i)
  .map(s => s.trim())
  .filter(s => s.length > 10 && !s.startsWith('/*') && !s.startsWith('--'));

console.log(`Found ${statements.length} SQL statements to execute\n`);

let successCount = 0;
let errorCount = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  
  // Skip comments
  if (stmt.startsWith('/*') || stmt.startsWith('--')) continue;
  
  try {
    // Extract statement type for logging
    const stmtType = stmt.match(/^\s*(CREATE|DROP|ALTER|GRANT|COMMENT|UPDATE|DO)/i)?.[1] || 'SQL';
    
    // Execute via raw SQL using the REST API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ 
        query: stmt + ';'
      })
    });

    if (response.ok || response.status === 204) {
      successCount++;
      console.log(`✓ Statement ${i + 1}/${statements.length}: ${stmtType} - Success`);
    } else {
      const errorText = await response.text();
      console.error(`✗ Statement ${i + 1}/${statements.length}: ${stmtType} - Failed`);
      console.error(`  Error: ${errorText}\n`);
      errorCount++;
    }
  } catch (err) {
    errorCount++;
    console.error(`✗ Statement ${i + 1}/${statements.length}: Error - ${err.message}\n`);
  }
}

console.log('\n' + '='.repeat(60));
console.log(`Migration execution completed`);
console.log(`Success: ${successCount} statements`);
console.log(`Errors: ${errorCount} statements`);
console.log('='.repeat(60));

if (errorCount > 0) {
  console.log('\n⚠️  Some statements failed. This may be expected for idempotent operations.');
  console.log('Please verify the functions were created by running:');
  console.log('\nSELECT routine_name FROM information_schema.routines');
  console.log("WHERE routine_name LIKE '%user%' OR routine_name LIKE '%device%';");
}

process.exit(errorCount > 0 ? 1 : 0);
