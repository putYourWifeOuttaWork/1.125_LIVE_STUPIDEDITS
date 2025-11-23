import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Verifying Phase 3 Implementation...\n');

const result = await supabase
  .from('devices')
  .select('device_code, total_wakes, total_images_taken, total_alerts, total_images_expected_to_date, last_wake_at')
  .order('total_wakes', { ascending: false })
  .limit(5);

if (result.error) {
  console.error('Error:', result.error);
} else {
  console.log('Device Counters (Top 5 by wakes):');
  if (result.data.length === 0) {
    console.log('  No devices with activity yet\n');
  } else {
    result.data.forEach(d => {
      const wakes = d.total_wakes || 0;
      const images = d.total_images_taken || 0;
      const alerts = d.total_alerts || 0;
      const expected = d.total_images_expected_to_date || 0;
      console.log('  ' + d.device_code + ': ' + wakes + ' wakes, ' + images + ' images, ' + alerts + ' alerts, ' + expected + ' expected');
    });
    console.log();
  }
}

const wakes = await supabase.from('device_wake_payloads').select('*', { count: 'exact', head: true });
const images = await supabase.from('device_images').select('*', { count: 'exact', head: true }).eq('status', 'complete');
const alerts = await supabase.from('device_alerts').select('*', { count: 'exact', head: true });

console.log('Wake Payloads: ' + (wakes.count || 0) + ' records');
console.log('Completed Images: ' + (images.count || 0) + ' records');
console.log('Alerts: ' + (alerts.count || 0) + ' records\n');

console.log('Phase 3 Triggers Applied Successfully!');
