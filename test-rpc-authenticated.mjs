#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function testRPC() {
  console.log('=== Testing RPC as Authenticated User ===\n');

  // Sign in as a test user (we need a real user email/password)
  // Let's use service role key instead to bypass auth
  const supabaseServiceRole = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
  );

  const sessionId = '76388628-65f3-47e9-8061-b5574be7d84a'; // Nov 19 session

  console.log(`Calling RPC with service role key...\n`);

  const { data, error } = await supabaseServiceRole.rpc('get_session_devices_with_wakes', {
    p_session_id: sessionId
  });

  if (error) {
    console.error('❌ RPC Error:', error);
    return;
  }

  console.log('✅ RPC Success!');
  console.log(`\nDevices returned: ${data?.devices?.length || 0}\n`);

  if (data?.devices && data.devices.length > 0) {
    data.devices.forEach(d => {
      console.log(`Device: ${d.device_code || d.device_name}`);
      console.log(`  Expected wakes: ${d.expected_wakes_in_session}`);
      console.log(`  Actual wakes: ${d.actual_wakes}`);
      console.log(`  Completed wakes: ${d.completed_wakes} ⬅️ THIS IS WHAT UI SHOWS`);
      console.log(`  Failed wakes: ${d.failed_wakes}`);
      console.log(`  Extra wakes: ${d.extra_wakes}`);
      console.log('');
    });

    const totalCompleted = data.devices.reduce((sum, d) => sum + d.completed_wakes, 0);
    const totalFailed = data.devices.reduce((sum, d) => sum + d.failed_wakes, 0);
    const totalExtra = data.devices.reduce((sum, d) => sum + d.extra_wakes, 0);
    
    console.log(`\nTOTALS (what UI displays):`);
    console.log(`  Completed: ${totalCompleted} ⬅️ Should be 60`);
    console.log(`  Failed: ${totalFailed}`);
    console.log(`  Extra: ${totalExtra}`);
  } else {
    console.log('⚠️  No devices data returned!');
    console.log('Raw response:', JSON.stringify(data, null, 2));
  }
}

testRPC().then(() => process.exit(0)).catch(console.error);
