import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🚀 Applying Snapshot Cadence Migration\n');

// Step 1: Add column to sites table
console.log('Step 1: Adding snapshot_cadence_per_day column to sites...');
const migration = readFileSync('./snapshot-cadence-migration.sql', 'utf8');

// We need to use the SQL editor or create via RPC
// For now, let's verify if column exists
const { data: testData, error: testError } = await supabase
  .from('sites')
  .select('site_id, snapshot_cadence_per_day')
  .limit(1);

if (testError && testError.message.includes('snapshot_cadence_per_day')) {
  console.log('⚠️  Column does not exist yet');
  console.log('\n📋 MANUAL MIGRATION REQUIRED:');
  console.log('══════════════════════════════════════════════════════════\n');
  console.log('Please run this SQL in Supabase Dashboard > SQL Editor:\n');
  console.log(migration);
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('\n🔗 Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql');
  process.exit(0);
} else if (testError) {
  console.error('❌ Error checking schema:', testError);
  process.exit(1);
} else {
  console.log('✅ Column already exists!');
  console.log(`   Current sites have snapshot_cadence_per_day: ${testData[0]?.snapshot_cadence_per_day ?? 'N/A'}`);
}

console.log('\n✅ Migration check complete!');
console.log('\n📋 Next steps:');
console.log('  1. Apply full migration SQL (see snapshot-cadence-migration-full.sql)');
console.log('  2. Set up pg_cron job for hourly snapshot generation');
console.log('  3. Add UI controls for cadence configuration');
