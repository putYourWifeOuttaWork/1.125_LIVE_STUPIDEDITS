#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY  // Use anon key like the UI does
);

async function testRPC() {
  console.log('=== Testing RPC as UI Would Call It ===\n');

  const sessionId = '76388628-65f3-47e9-8061-b5574be7d84a'; // Nov 19 session

  console.log(`Calling get_session_devices_with_wakes for session: ${sessionId}\n`);

  const { data, error } = await supabase.rpc('get_session_devices_with_wakes', {
    p_session_id: sessionId
  });

  if (error) {
    console.error('❌ RPC Error:', error);
    return;
  }

  console.log('✅ RPC Success!');
  console.log(`\nDevices returned: ${data?.devices?.length || 0}\n`);

  if (data?.devices) {
    data.devices.forEach(d => {
      console.log(`Device: ${d.device_code || d.device_name}`);
      console.log(`  Expected wakes: ${d.expected_wakes_in_session}`);
      console.log(`  Actual wakes: ${d.actual_wakes}`);
      console.log(`  Completed wakes: ${d.completed_wakes} ⬅️`);
      console.log(`  Failed wakes: ${d.failed_wakes}`);
      console.log(`  Extra wakes: ${d.extra_wakes}`);
      console.log('');
    });

    const totalCompleted = data.devices.reduce((sum, d) => sum + d.completed_wakes, 0);
    const totalExtra = data.devices.reduce((sum, d) => sum + d.extra_wakes, 0);
    
    console.log(`TOTALS (what UI should display):`);
    console.log(`  Completed: ${totalCompleted}`);
    console.log(`  Extra: ${totalExtra}`);
  } else {
    console.log('No devices data returned!');
  }
}

testRPC().then(() => process.exit(0)).catch(console.error);
