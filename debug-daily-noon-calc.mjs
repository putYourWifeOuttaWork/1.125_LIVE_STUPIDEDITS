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

console.log('🔍 Debugging "Daily at noon" calculation...\n');

const testCron = '0 12 * * *';
const lastWake = '2026-01-03T21:54:00Z'; // Jan 3, 9:54 PM UTC

console.log(`Cron Expression: ${testCron}`);
console.log(`Last Wake: ${lastWake}`);
console.log(`Expected: Next Jan 4 at 12:00 UTC\n`);

// Test fn_calculate_next_wake_time
console.log('Testing fn_calculate_next_wake_time...');
try {
  const { data, error } = await supabase.rpc('fn_calculate_next_wake_time', {
    p_last_wake_at: lastWake,
    p_cron_expression: testCron,
    p_timezone: 'UTC'
  });

  if (error) {
    console.log(`❌ Error: ${error.message}`);
  } else {
    console.log(`✅ Result: ${data}`);
    const lastWakeDate = new Date(lastWake);
    const nextWakeDate = new Date(data);
    const diffHours = (nextWakeDate - lastWakeDate) / (1000 * 60 * 60);
    console.log(`⏱️  Hours from last wake: ${diffHours.toFixed(1)}`);
  }
} catch (err) {
  console.log(`❌ Exception: ${err.message}`);
}

console.log('\n---\n');

// Check if get_next_wake_times exists
console.log('Checking if get_next_wake_times RPC function exists...');
try {
  const { data, error } = await supabase.rpc('get_next_wake_times', {
    p_device_id: '2b8a8468-1c92-4553-a044-edb60b0ba7c5',
    p_count: 3
  });

  if (error) {
    console.log(`❌ Error: ${error.message}`);
    console.log(`💡 Function probably doesn't exist or has different signature`);
  } else {
    console.log(`✅ Function exists and returned:`);
    console.log(JSON.stringify(data, null, 2));
  }
} catch (err) {
  console.log(`❌ Exception: ${err.message}`);
}
