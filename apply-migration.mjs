import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

// Load environment variables
config({ path: '/tmp/cc-agent/51386994/project/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('🚀 Applying snapshot cadence migration...\n');

// Read migration file
const migrationSQL = readFileSync('/tmp/snapshot_cadence_migration.sql', 'utf8');

// Split into individual statements (rough split)
const statements = migrationSQL
  .split(/;\s*$$/m)
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

console.log(`Found ${statements.length} SQL statements to execute\n`);

// Execute via Supabase SQL editor endpoint
const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': supabaseServiceKey,
    'Authorization': `Bearer ${supabaseServiceKey}`
  },
  body: JSON.stringify({ query: migrationSQL })
});

if (!response.ok) {
  const error = await response.text();
  console.error('❌ Migration failed:', error);
  
  // Try alternative: use pg client
  console.log('\n⚠️  Direct execution failed. Saving migration file for manual execution.');
  console.log('📝 Migration saved to: /tmp/snapshot_cadence_migration.sql');
  console.log('\n📋 To apply manually:');
  console.log('   1. Go to Supabase Dashboard > SQL Editor');
  console.log('   2. Copy contents from /tmp/snapshot_cadence_migration.sql');
  console.log('   3. Execute in SQL editor');
  process.exit(1);
}

console.log('✅ Migration applied successfully!\n');
console.log('📋 Summary:');
console.log('  - Added snapshot_cadence_per_day column to sites table');
console.log('  - Created get_next_snapshot_time() function');
console.log('  - Created is_snapshot_due() function');  
console.log('  - Created generate_scheduled_snapshots() function');
console.log('  - Added indexes for performance');
console.log('\n⚠️  Next Steps:');
console.log('  1. Set up pg_cron job in Supabase Dashboard');
console.log('  2. Add UI controls for snapshot cadence');
console.log('  3. Test snapshot generation');

