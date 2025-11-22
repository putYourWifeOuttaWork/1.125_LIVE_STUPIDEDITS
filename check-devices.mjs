import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkDevices() {
  const { data: devices } = await supabase
    .from('devices')
    .select('device_id, device_code, site_id, program_id, provisioning_status')
    .order('created_at', { ascending: false })
    .limit(10);
  
  console.log('Recent devices:');
  console.table(devices?.map(d => ({
    code: d.device_code,
    site_id: d.site_id?.substring(0, 8),
    program_id: d.program_id?.substring(0, 8),
    status: d.provisioning_status
  })));
}

checkDevices().catch(console.error);
