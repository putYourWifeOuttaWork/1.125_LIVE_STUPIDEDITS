import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const deviceId = '15207d5d-1c32-4559-a3e8-216cee867527';
  
  console.log('Checking wake reliability for device:', deviceId);
  
  // Check device wake_payloads
  const { data: payloads, error } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, captured_at, wake_window_index, overage_flag')
    .eq('device_id', deviceId)
    .gte('captured_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('captured_at', { ascending: false });
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('\nRecent wake payloads (last 7 days):');
  console.log('Total:', payloads.length, 'wakes');
  payloads.slice(0, 10).forEach(p => {
    const overage = p.overage_flag ? ' (OVERAGE)' : '';
    console.log('  ', p.captured_at, '- Window', p.wake_window_index, overage);
  });
  
  // Get device schedule
  const { data: device } = await supabase
    .from('devices')
    .select('wake_schedule_cron, device_name')
    .eq('device_id', deviceId)
    .single();
  
  console.log('\nDevice wake schedule:', device.wake_schedule_cron);
  
  // Calculate expected wakes for last 3 scheduled times
  console.log('\n🔍 Need to calculate:');
  console.log('  - Last 3 expected wake times');
  console.log('  - Actual wakes received for those times');
  console.log('  - Reliability percentage');
  console.log('\n💡 This should be calculated by a database function or hook');
}

check();
