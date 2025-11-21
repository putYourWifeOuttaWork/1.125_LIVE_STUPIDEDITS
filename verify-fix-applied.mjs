import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  console.log('🔍 Verifying Context Inheritance Fix\n');
  
  // Check 1: Database function exists
  console.log('1️⃣ Checking database function...');
  const { data: func, error: funcError } = await supabase.rpc('fn_get_active_session_for_site', {
    p_site_id: '134218af-9afc-4ee9-9244-050f51ccbb39'
  });
  
  if (funcError) {
    console.log('   ❌ Function not found or error:', funcError.message);
    console.log('   👉 Apply migration: fix-telemetry-context-inheritance.sql\n');
  } else {
    console.log('   ✅ Function exists and returns:', func || 'NULL (no active session)');
    console.log('');
  }
  
  // Check 2: Recent telemetry
  console.log('2️⃣ Checking most recent telemetry...');
  const { data: telemetry, error: telError } = await supabase
    .from('device_telemetry')
    .select('telemetry_id, device_id, program_id, site_id, site_device_session_id, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (telError) {
    console.log('   ❌ Error:', telError.message);
  } else {
    console.log('   Record:', telemetry.telemetry_id);
    console.log('   Created:', telemetry.created_at);
    console.log('   program_id:', telemetry.program_id ? '✅ ' + telemetry.program_id : '❌ NULL');
    console.log('   site_id:', telemetry.site_id ? '✅ ' + telemetry.site_id : '❌ NULL');
    console.log('   session_id:', telemetry.site_device_session_id ? '✅ ' + telemetry.site_device_session_id : '❌ NULL');
    
    if (!telemetry.program_id || !telemetry.site_id) {
      console.log('\n   ⚠️  This record was created before the fix');
      console.log('   👉 Send a new MQTT message to test the fix\n');
    } else {
      console.log('\n   🎉 Fix is working! Context is populated!\n');
    }
  }
  
  // Check 3: Edge function status (can't check directly, but we can check)
  console.log('3️⃣ Deployment checklist:');
  console.log('   □ Apply fix-telemetry-context-inheritance.sql in Supabase SQL Editor');
  console.log('   □ Apply fix-device-images-context.sql in Supabase SQL Editor');
  console.log('   □ Deploy mqtt_device_handler edge function');
  console.log('   □ Send new MQTT test message');
  console.log('   □ Run this script again to verify\n');
}

verify();
