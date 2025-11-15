import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking for test device A3:67:B2:11:22:33...\n');

const { data: device, error } = await supabase
  .from('devices')
  .select('*')
  .eq('device_mac', 'A3:67:B2:11:22:33')
  .maybeSingle();

if (error) {
  console.error('❌ Error querying device:', error);
  process.exit(1);
}

if (device) {
  console.log('✅ Device found!');
  console.log('📋 Device details:');
  console.log('   - ID:', device.device_id);
  console.log('   - MAC:', device.device_mac);
  console.log('   - Code:', device.device_code);
  console.log('   - Name:', device.device_name);
  console.log('   - Status:', device.provisioning_status);
  console.log('   - Active:', device.is_active);
  console.log('   - Last Seen:', device.last_seen_at);
  console.log('   - Created:', device.created_at);
} else {
  console.log('❌ Device not found - auto-provisioning may have failed');
  console.log('   Check edge function logs in Supabase dashboard');
}
