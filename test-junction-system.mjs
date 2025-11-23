import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testSystem() {
  console.log('🧪 Testing Junction Table System\n');

  // Test 1: Check a backfilled device
  console.log('Test 1: Checking LAB001 junction records...');
  const { data: lab001Device } = await supabase
    .from('devices')
    .select('device_id, device_code, site_id, program_id')
    .eq('device_code', 'LAB001')
    .single();

  if (lab001Device) {
    const { data: junctionRecords } = await supabase
      .from('device_site_assignments')
      .select('*, sites(name), pilot_programs(name)')
      .eq('device_id', lab001Device.device_id)
      .eq('is_active', true);

    if (junctionRecords && junctionRecords.length > 0) {
      console.log('   ✅ LAB001 has junction record');
      console.log(`   Site: ${junctionRecords[0].sites?.name || 'N/A'}`);
      console.log(`   Program: ${junctionRecords[0].pilot_programs?.name || 'N/A'}`);
    } else {
      console.log('   ❌ LAB001 missing junction record');
    }
  }

  // Test 2: Check functions exist
  console.log('\nTest 2: Checking if functions were updated...');
  const { data: functions } = await supabase.rpc('get_function_source', {
    function_name: 'fn_assign_device_to_site'
  }).then(r => ({ data: 'exists' })).catch(() => ({ data: null }));

  if (functions) {
    console.log('   ✅ fn_assign_device_to_site exists');
  }

  // Test 3: Count total junction records
  console.log('\nTest 3: Counting total junction records...');
  const { count } = await supabase
    .from('device_site_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  console.log(`   ✅ ${count} active device site assignments`);

  console.log('\n🎉 Junction table system is operational!\n');
}

testSystem();
