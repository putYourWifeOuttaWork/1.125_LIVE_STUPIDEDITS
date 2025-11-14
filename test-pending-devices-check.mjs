import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function testPendingDevices() {
  console.log('Checking for pending_mapping devices...\n');

  const { data, error } = await supabase
    .from('devices')
    .select(`
      device_id,
      device_code,
      device_mac,
      provisioning_status,
      is_active,
      site_id,
      created_at
    `)
    .eq('provisioning_status', 'pending_mapping')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  const count = data ? data.length : 0;
  console.log(`Found ${count} devices with provisioning_status='pending_mapping'`);

  if (data && data.length > 0) {
    console.log('\nDevices:');
    data.forEach((d, i) => {
      console.log(`${i + 1}. ${d.device_code || d.device_mac}`);
      console.log(`   - ID: ${d.device_id}`);
      console.log(`   - Status: ${d.provisioning_status}`);
      console.log(`   - Site: ${d.site_id || 'None'}`);
      console.log(`   - Created: ${d.created_at}`);
      console.log('');
    });
  } else {
    console.log('\nNo pending devices found. This explains why the UI is not showing them.');
  }

  // Also check all devices to see their statuses
  console.log('\n--- All Devices Summary ---');
  const { data: allDevices } = await supabase
    .from('devices')
    .select('device_id, device_code, provisioning_status, is_active, site_id')
    .order('created_at', { ascending: false })
    .limit(10);

  if (allDevices) {
    console.log(`\nShowing last 10 devices:`);
    allDevices.forEach((d, i) => {
      console.log(`${i + 1}. ${d.device_code || 'No Code'} - Status: ${d.provisioning_status}, Active: ${d.is_active}, Site: ${d.site_id || 'None'}`);
    });
  }
}

testPendingDevices();
