import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceRoleKey);

console.log('🔍 Checking devices with SERVICE_ROLE key...\n');

const { data: devices, error, count } = await supabase
  .from('devices')
  .select('device_id, device_mac, device_name, is_active, site_id, program_id', { count: 'exact' })
  .limit(5);

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log(`Total devices in database: ${count}`);
console.log(`\nFirst 5 devices:`);
devices.forEach(d => {
  console.log(`- ${d.device_name} (${d.device_mac})`);
  console.log(`  is_active: ${d.is_active}, site: ${d.site_id ? 'Yes' : 'No'}, program: ${d.program_id ? 'Yes' : 'No'}`);
});
