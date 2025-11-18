import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n🧪 SIMPLIFIED LAB DATA GENERATOR\n');
console.log('This creates mock data directly in viewing tables for testing\n');

// Use the mock data generator that already exists
const { data, error } = await supabase.rpc('fn_generate_mock_lab_data', {
  p_days: 1,
  p_devices_per_site: 2,
  p_wakes_per_device: 5
});

if (error) {
  console.error('❌ Error:', error.message);
  console.log('\nThe mock data generator function might not exist yet.');
  console.log('You can create it or manually insert data into:');
  console.log('  - site_device_sessions');
  console.log('  - device_wake_payloads  ');
  console.log('  - device_images');
} else {
  console.log('✅ Mock data generated!');
  console.log('\n🎯 Next Steps:');
  console.log('   1. Navigate to Lab → Ingest Feed');
  console.log('   2. Try all filter tabs');
  console.log('   3. View the live feed\n');
}
