import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkDevices() {
  const { data: devices } = await supabase
    .from('devices')
    .select('device_id, device_name, device_mac, provisioning_status')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('All Devices:', devices?.length || 0);
  devices?.forEach(d => {
    console.log(`  - ${d.device_name || d.device_mac} (${d.provisioning_status})`);
  });

  // Check images
  const { data: images } = await supabase
    .from('device_images')
    .select('device_id, image_name, status')
    .limit(10);

  console.log('\nRecent Images:', images?.length || 0);
  images?.forEach(img => {
    console.log(`  - ${img.image_name}: ${img.status}`);
  });
}

checkDevices().catch(console.error);
