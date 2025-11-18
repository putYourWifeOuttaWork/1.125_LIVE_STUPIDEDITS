import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n🧪 TESTING DEVICE INHERITANCE\n');

const { data: sites } = await supabase
  .from('sites')
  .select('site_id, name, program_id, company_id')
  .limit(1);

if (!sites || sites.length === 0) {
  console.log('❌ No sites found');
  process.exit(1);
}

const site = sites[0];

console.log('Test site: ' + site.name);
console.log('Site program_id: ' + site.program_id);
console.log('Site company_id: ' + site.company_id);

const testCode = 'INHERIT_TEST_' + Date.now();

console.log('\n📝 Creating test device with only site_id...');

const { data: device, error } = await supabase
  .from('devices')
  .insert({
    device_mac: 'TEST:INHERIT:01',
    device_name: 'Inheritance Test Device',
    device_code: testCode,
    device_type: 'virtual',
    provisioning_status: 'pending_approval',
    site_id: site.site_id,
    x_position: 0,
    y_position: 0
  })
  .select()
  .single();

if (error) {
  console.log('\n❌ Insert failed:', error.message);
  process.exit(1);
}

console.log('\n✅ Device created!');
console.log('Device program_id: ' + (device.program_id || 'NULL'));
console.log('Device company_id: ' + (device.company_id || 'NULL'));

const programMatch = device.program_id === site.program_id;
const companyMatch = device.company_id === site.company_id;

console.log('\n📊 Inheritance Check:');
console.log('   program_id inherited: ' + (programMatch ? '✅ YES' : '❌ NO'));
console.log('   company_id inherited: ' + (companyMatch ? '✅ YES' : '❌ NO'));

if (programMatch && companyMatch) {
  console.log('\n✅ TRIGGER IS WORKING CORRECTLY!\n');
} else {
  console.log('\n⚠️  TRIGGER NOT WORKING - needs to be applied via Supabase Dashboard\n');
  console.log('Migration file created at:');
  console.log('supabase/migrations/20251118190000_enforce_device_site_program_inheritance.sql');
  console.log('\nApply it in Supabase Dashboard → SQL Editor\n');
}

console.log('Cleaning up...');
await supabase.from('devices').delete().eq('device_code', testCode);
console.log('Done!\n');
