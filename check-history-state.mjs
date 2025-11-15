import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('📊 Checking device_history state\n');

// Count total events
const { count: totalEvents } = await supabase
  .from('device_history')
  .select('*', { count: 'exact', head: true });

console.log(`Total events: ${totalEvents}`);

// Get sample event
const { data: sample } = await supabase
  .from('device_history')
  .select('*')
  .limit(1);

if (sample && sample.length > 0) {
  console.log('\nSample event columns:', Object.keys(sample[0]).join(', '));

  const hasSourceTable = 'source_table' in sample[0];
  const hasSourceId = 'source_id' in sample[0];
  const hasTriggeredBy = 'triggered_by' in sample[0];

  console.log(`\nNew columns present:`);
  console.log(`  source_table: ${hasSourceTable}`);
  console.log(`  source_id: ${hasSourceId}`);
  console.log(`  triggered_by: ${hasTriggeredBy}`);

  if (!hasSourceTable) {
    console.log('\n⚠️  Migration not yet applied. New columns missing.');
  } else {
    console.log('\n✅ Migration appears to be applied!');
  }
}

// Check schedule changes
const { count: scheduleChanges } = await supabase
  .from('device_schedule_changes')
  .select('*', { count: 'exact', head: true });

console.log(`\nSchedule changes in source table: ${scheduleChanges || 0}`);
