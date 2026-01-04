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

console.log('🧪 Testing fn_calculate_next_wake_time with various patterns...\n');

const testCases = [
  {
    name: 'Every hour (*)',
    cron: '0 * * * *',
    lastWake: '2026-01-04T12:00:00Z',
    expected: '1 hour later'
  },
  {
    name: 'Every 6 hours (*/6)',
    cron: '0 */6 * * *',
    lastWake: '2026-01-04T12:00:00Z',
    expected: '6 hours later'
  },
  {
    name: 'Every 12 hours (*/12)',
    cron: '0 */12 * * *',
    lastWake: '2026-01-04T12:00:00Z',
    expected: '12 hours later'
  },
  {
    name: 'Daily at noon',
    cron: '0 12 * * *',
    lastWake: '2026-01-04T08:00:00Z',
    expected: 'today at noon'
  },
  {
    name: 'Twice daily (6am, 6pm)',
    cron: '0 6,18 * * *',
    lastWake: '2026-01-04T08:00:00Z',
    expected: 'next at 6pm'
  },
  {
    name: 'Daily at midnight',
    cron: '0 0 * * *',
    lastWake: '2026-01-04T08:00:00Z',
    expected: 'tomorrow at midnight'
  }
];

for (const test of testCases) {
  console.log(`📋 Test: ${test.name}`);
  console.log(`   Cron: ${test.cron}`);
  console.log(`   Last Wake: ${test.lastWake}`);
  console.log(`   Expected: ${test.expected}`);

  try {
    const { data, error } = await supabase.rpc('fn_calculate_next_wake_time', {
      p_last_wake_at: test.lastWake,
      p_cron_expression: test.cron,
      p_timezone: 'UTC'
    });

    if (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
    } else {
      const lastWakeDate = new Date(test.lastWake);
      const nextWakeDate = new Date(data);
      const diffHours = (nextWakeDate - lastWakeDate) / (1000 * 60 * 60);

      console.log(`   ✅ Next Wake: ${data}`);
      console.log(`   ⏱️  Difference: ${diffHours.toFixed(1)} hours\n`);
    }
  } catch (err) {
    console.log(`   ❌ Exception: ${err.message}\n`);
  }
}

console.log('💡 Note: Apply fix-next-wake-calculation-support-star.sql to fix the wildcard (*) pattern');
