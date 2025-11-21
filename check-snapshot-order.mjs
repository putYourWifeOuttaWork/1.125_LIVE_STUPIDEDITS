import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const { data: snapshots, error } = await supabase
  .from('session_wake_snapshots')
  .select('snapshot_id, session_id, wake_number, wake_round_start, site_state')
  .eq('site_id', '4e867fc9-4b6c-4159-b9b3-c24ab11b9f31')
  .order('wake_round_start', { ascending: true });

console.log('Error:', error);
console.log('Total snapshots:', snapshots?.length);
console.log('\nIoT Test Site 2 - Snapshots:\n');

if (snapshots) {
  snapshots.slice(0, 12).forEach((s, i) => {
    const devices = s.site_state?.devices || [];
    const firstDevice = devices[0];
    
    console.log(`${i+1}. Wake #${s.wake_number} - ${new Date(s.wake_round_start).toLocaleString()}`);
    console.log(`   ${devices.length} devices, First temp: ${firstDevice?.telemetry?.latest_temperature || 'null'}`);
  });
}
