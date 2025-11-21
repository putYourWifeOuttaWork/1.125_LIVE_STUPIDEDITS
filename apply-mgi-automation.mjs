import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const migrationPath = 'supabase/migrations/20251121000001_device_image_automation.sql';
console.log('📦 Applying MGI Automation Migration...\n');

const sql = readFileSync(migrationPath, 'utf8');

const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql }).catch(async () => {
  // If exec_sql doesn't exist, try direct query
  return await supabase.from('_realtime').select('*').limit(0).then(() => {
    // Connection works, now execute via raw SQL
    return supabase.rpc('query', { query_text: sql });
  });
}).catch(async () => {
  // Last resort: split and execute
  console.log('Executing migration via direct connection...\n');
  const pg = await import('pg');
  const client = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(sql);
  await client.end();
  return { data: result, error: null };
});

if (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}

console.log('✅ Migration applied successfully!');
console.log('\n📊 Verifying trigger...');

const { data: triggers } = await supabase.rpc('query', {
  query_text: `
    SELECT trigger_name, event_manipulation, action_statement
    FROM information_schema.triggers
    WHERE trigger_name = 'trigger_calculate_and_rollup_mgi';
  `
}).catch(() => ({ data: null }));

if (triggers) {
  console.log('✅ Trigger created:', triggers);
} else {
  console.log('⚠️  Could not verify trigger (may still be working)');
}

console.log('\n🎯 Next: Run seed script');
console.log('   node seed-iot-test-site-2.mjs\n');
