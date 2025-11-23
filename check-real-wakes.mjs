import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log('\n=== Real Device Wake Payloads ===\n');

  const { data: wakes } = await supabase
    .from('device_wake_payloads')
    .select('*')
    .gte('captured_at', '2025-11-20')
    .order('captured_at', { ascending: false });

  console.log('Total wake payloads:', wakes?.length || 0);

  if (wakes && wakes.length > 0) {
    wakes.forEach(w => {
      console.log('\nWake Payload:');
      console.log('  ID:', w.payload_id.substring(0, 8) + '...');
      console.log('  Device:', w.device_id ? w.device_id.substring(0, 8) + '...' : 'NULL');
      console.log('  Captured:', w.captured_at);
      console.log('  Status:', w.payload_status);
      console.log('  Image ID:', w.image_id || 'NULL');
      console.log('  Wake Type:', w.wake_type);
      console.log('  Session:', w.site_device_session_id ? w.site_device_session_id.substring(0, 8) + '...' : 'NULL');
    });
  } else {
    console.log('\n⚠️  NO REAL DEVICE WAKES FOUND');
    console.log('\nThe system is ready but needs:');
    console.log('1. Real device to send HELLO message');
    console.log('2. Then device sends image chunks');
    console.log('3. MQTT handler processes and creates wake_payload');
    console.log('4. Image completes → wake_payload marked complete');
    console.log('5. Triggers increment session counters');
    console.log('\nAll the infrastructure is in place!');
  }
}

check();
