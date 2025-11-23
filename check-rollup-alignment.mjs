import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const { data: sessions } = await supabase
  .from('site_device_sessions')
  .select('session_id, site_id, session_date, expected_wake_count, completed_wake_count, failed_wake_count, extra_wake_count')
  .order('session_date', { ascending: false })
  .limit(3);

console.log('Checking session roll-up alignment:\n');

for (const s of sessions) {
  console.log(`Session ${s.session_date}`);
  console.log(`  Stored: complete=${s.completed_wake_count}, failed=${s.failed_wake_count}, extra=${s.extra_wake_count}`);
  
  const { data: p } = await supabase
    .from('device_wake_payloads')
    .select('payload_status, overage_flag')
    .eq('site_device_session_id', s.session_id);
  
  const complete = p.filter(x => x.payload_status === 'complete' && !x.overage_flag).length;
  const failed = p.filter(x => x.payload_status === 'failed').length;
  const extra = p.filter(x => x.overage_flag).length;
  
  console.log(`  Actual:  complete=${complete}, failed=${failed}, extra=${extra}`);
  console.log(`  Status: ${complete === s.completed_wake_count && failed === s.failed_wake_count ? 'ALIGNED' : 'MISALIGNED'}\n`);
}
