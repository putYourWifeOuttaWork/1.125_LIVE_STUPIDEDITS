import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔍 Checking devices in database...\n');

const { data: devices, error } = await supabase
  .from('devices')
  .select('device_id, device_mac, device_name, device_type, is_active, site_id, program_id')
  .order('created_at', { ascending: false })
  .limit(10);

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

if (!devices || devices.length === 0) {
  console.log('❌ No devices found in database!');
  console.log('\n💡 You need to create a device first:');
  console.log('   1. Go to Devices page in the app');
  console.log('   2. Click "Register New Device"');
  console.log('   3. Fill in the form and save');
} else {
  console.log(`✅ Found ${devices.length} device(s):\n`);
  console.log('Device Name             | MAC Address       | Type     | Active? | Site? | Program?');
  console.log('─'.repeat(85));

  devices.forEach(d => {
    const name = (d.device_name || 'Unnamed').padEnd(23);
    const mac = (d.device_mac || 'N/A').padEnd(17);
    const type = (d.device_type || 'N/A').padEnd(8);
    const status = (d.is_active ? 'Yes' : 'No').padEnd(7);
    const hasSite = d.site_id ? '✅' : '❌';
    const hasProgram = d.program_id ? '✅' : '❌';
    
    console.log(`${name} | ${mac} | ${type} | ${status} | ${hasSite}    | ${hasProgram}`);
  });
  
  const readyDevices = devices.filter(d =>
    d.device_type === 'physical' &&
    d.is_active === true &&
    d.site_id &&
    d.program_id
  );
  
  console.log('\n' + '─'.repeat(85));
  
  if (readyDevices.length > 0) {
    console.log(`✅ ${readyDevices.length} device(s) ready for testing!`);
    console.log('\n🎯 Run: node test-mgi-real-image.mjs');
  } else {
    console.log('⚠️  No devices are ready for testing');
    console.log('\n💡 To make a device ready:');
    console.log('   - Device type must be "physical"');
    console.log('   - is_active must be true');
    console.log('   - Must be assigned to a site');
    console.log('   - Must be assigned to a program');
  }
}
