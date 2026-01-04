#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});

console.log('🧪 Testing preview_next_wake_times function...\n');

const testCases = [
  { name: 'Every hour', cron: '0 * * * *' },
  { name: 'Every 6 hours', cron: '0 */6 * * *' },
  { name: 'Every 12 hours', cron: '0 */12 * * *' },
  { name: 'Daily at noon', cron: '0 12 * * *' },
  { name: 'Twice daily', cron: '0 6,18 * * *' },
  { name: 'Daily at midnight', cron: '0 0 * * *' }
];

for (const test of testCases) {
  console.log(`\n📋 ${test.name}: ${test.cron}`);

  try {
    const { data, error } = await supabase.rpc('preview_next_wake_times', {
      p_cron_expression: test.cron,
      p_timezone: 'UTC',
      p_start_from: new Date().toISOString(),
      p_count: 3
    });

    if (error) {
      console.log(`   ❌ Error: ${error.message}`);
    } else {
      console.log(`   ✅ Result:`);
      console.log(`   Wake Times: ${JSON.stringify(data.wake_times, null, 2)}`);
      console.log(`   Timezone: ${data.timezone}`);
      if (data.error) {
        console.log(`   ⚠️  Function Error: ${data.error}`);
      }
    }
  } catch (err) {
    console.log(`   ❌ Exception: ${err.message}`);
  }
}

console.log('\n✅ Test complete!');
