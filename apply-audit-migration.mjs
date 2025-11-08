import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function applyMigration() {
  console.log('Testing get_program_history_with_devices function...\n');

  const { data, error } = await supabase
    .rpc('get_program_history_with_devices', {
      p_program_id: 'b5e18757-4383-43e2-a248-3288040f4e38',
      p_start_date: null,
      p_end_date: null,
      p_event_types: null,
      p_device_categories: null,
      p_limit: 10
    });

  if (error) {
    console.error('❌ Function test failed:', error.message);
    console.error('Error details:', error);
    console.log('\n⚠️  MIGRATION NEEDS TO BE APPLIED ⚠️');
    console.log('File location: supabase/migrations/20251108230000_fix_audit_history_rpc_functions.sql');
    console.log('\nPlease apply this migration using one of these methods:');
    console.log('1. Supabase Dashboard > SQL Editor > paste migration content');
    console.log('2. Use the mcp__supabase__apply_migration tool');
    process.exit(1);
  } else {
    console.log('✅ Function working correctly! Rows returned:', data?.length || 0);
    if (data && data.length > 0) {
      console.log('\nSample event:');
      console.log('  Event ID:', data[0].event_id);
      console.log('  Event Type:', data[0].event_type);
      console.log('  Source:', data[0].event_source);
      console.log('  Timestamp:', data[0].event_timestamp);
    }
    console.log('\n✅ Audit log functions are working correctly!');
  }
}

applyMigration().catch(console.error);
