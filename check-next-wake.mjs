import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Checking next_wake_at status...\n');

const result = await supabase
  .from('devices')
  .select('device_code, last_wake_at, next_wake_at, wake_schedule_cron')
  .order('last_wake_at', { ascending: false, nullsFirst: false })
  .limit(10);

if (result.error) {
  console.error('Error:', result.error);
} else {
  console.log('Top 10 devices by recent wake:\n');
  result.data.forEach(d => {
    const lastWake = d.last_wake_at ? new Date(d.last_wake_at).toLocaleString() : 'Never';
    const nextWake = d.next_wake_at ? new Date(d.next_wake_at).toLocaleString() : 'Not calculated';
    const hasSchedule = d.wake_schedule_cron ? 'Yes' : 'No';
    console.log(d.device_code);
    console.log('  Last wake: ' + lastWake);
    console.log('  Next wake: ' + nextWake);
    console.log('  Has schedule: ' + hasSchedule);
    console.log();
  });
}
