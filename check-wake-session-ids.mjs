import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Checking wake payloads with session IDs...\n');

// Check how many wake payloads have site_device_session_id populated
const total = await supabase
  .from('device_wake_payloads')
  .select('*', { count: 'exact', head: true });

const withSession = await supabase
  .from('device_wake_payloads')
  .select('*', { count: 'exact', head: true })
  .not('site_device_session_id', 'is', null);

console.log('Total wake payloads:', total.count);
console.log('With site_device_session_id:', withSession.count);
console.log('Without site_device_session_id:', (total.count || 0) - (withSession.count || 0));
console.log();

// Get a sample
const sample = await supabase
  .from('device_wake_payloads')
  .select('payload_id, device_id, captured_at, site_device_session_id')
  .order('captured_at', { ascending: false })
  .limit(5);

console.log('Recent wake payloads sample:');
sample.data?.forEach(wp => {
  console.log('  ' + wp.captured_at + ' - Session: ' + (wp.site_device_session_id || 'NULL'));
});
