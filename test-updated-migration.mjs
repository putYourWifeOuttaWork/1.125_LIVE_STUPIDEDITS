import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function testAuditFunctions() {
  console.log('Testing get_program_audit_history function...\n');

  const { data, error } = await supabase
    .rpc('get_program_audit_history', {
      p_program_id: 'b5e18757-4383-43e2-a248-3288040f4e38',
      p_start_date: null,
      p_end_date: null,
      p_event_types: null,
      p_limit: 10
    });

  if (error) {
    console.error('❌ Function test failed:', error.message);
    console.error('Error details:', error);
    console.log('\n⚠️  UPDATED MIGRATION NEEDS TO BE APPLIED ⚠️');
    console.log('File location: supabase/migrations/20251108235959_separate_device_and_audit_history.sql');
    console.log('\nPlease reapply this migration - it has been updated with TEXT casts!');
    process.exit(1);
  } else {
    console.log('✅ Function working correctly! Rows returned:', data?.length || 0);
    if (data && data.length > 0) {
      console.log('\nSample events:');
      data.slice(0, 3).forEach((event, index) => {
        console.log(`\n${index + 1}. Event Type: ${event.event_type}`);
        console.log(`   Source: ${event.event_source}`);
        console.log(`   Timestamp: ${event.event_timestamp}`);
        console.log(`   Object: ${event.object_type}`);
      });
    } else {
      console.log('\n⚠️  No audit log entries found');
      console.log('This could mean:');
      console.log('1. The program has no recorded activity yet');
      console.log('2. The staging table is empty');
      console.log('3. RLS policies are blocking access');
    }
    console.log('\n✅ Audit log functions are working correctly!');
  }
}

testAuditFunctions().catch(console.error);
