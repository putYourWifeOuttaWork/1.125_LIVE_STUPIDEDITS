#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkData() {
  console.log('=== Checking RPC vs Actual Data ===\n');

  // Get Nov 19 session
  const { data: session } = await supabase
    .from('site_device_sessions')
    .select('session_id, session_date, sites(name)')
    .eq('session_date', '2025-11-19')
    .single();

  console.log(`Session: ${session.sites.name} - ${session.session_date}`);
  console.log(`Session ID: ${session.session_id}\n`);

  // Check actual payloads in database
  console.log('=== ACTUAL DATABASE DATA ===');
  const { data: payloads } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, device_id, payload_status, overage_flag, site_device_session_id')
    .eq('site_device_session_id', session.session_id);

  console.log(`Total payloads linked to this session: ${payloads?.length || 0}`);

  if (payloads && payloads.length > 0) {
    const complete_not_overage = payloads.filter(p => p.payload_status === 'complete' && p.overage_flag === false).length;
    const complete_overage = payloads.filter(p => p.payload_status === 'complete' && p.overage_flag === true).length;
    const failed = payloads.filter(p => p.payload_status === 'failed').length;
    const pending = payloads.filter(p => p.payload_status === 'pending').length;

    console.log('\nBreakdown:');
    console.log(`  Complete (overage=false): ${complete_not_overage} ⬅️ Should be "Completed"`);
    console.log(`  Complete (overage=true): ${complete_overage} ⬅️ Should be "Extra"`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Pending: ${pending}`);

    // Group by device
    const byDevice = {};
    payloads.forEach(p => {
      if (!byDevice[p.device_id]) {
        byDevice[p.device_id] = { complete: 0, overage: 0, failed: 0 };
      }
      if (p.payload_status === 'complete' && !p.overage_flag) byDevice[p.device_id].complete++;
      if (p.overage_flag) byDevice[p.device_id].overage++;
      if (p.payload_status === 'failed') byDevice[p.device_id].failed++;
    });

    console.log('\nBy Device:');
    for (const [deviceId, counts] of Object.entries(byDevice)) {
      console.log(`  ${deviceId.substring(0, 8)}: ${counts.complete} complete, ${counts.overage} extra, ${counts.failed} failed`);
    }
  }

  // Call the RPC function
  console.log('\n=== RPC FUNCTION OUTPUT ===');
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_session_devices_with_wakes', {
      p_session_id: session.session_id
    });

  if (rpcError) {
    console.error('RPC Error:', rpcError);
    return;
  }

  console.log(`Devices returned: ${rpcData?.devices?.length || 0}\n`);

  if (rpcData?.devices) {
    rpcData.devices.forEach(d => {
      console.log(`Device: ${d.device_code}`);
      console.log(`  Expected: ${d.expected_wakes_in_session}`);
      console.log(`  Actual: ${d.actual_wakes}`);
      console.log(`  Completed: ${d.completed_wakes} ⬅️ Should match DB count`);
      console.log(`  Failed: ${d.failed_wakes}`);
      console.log(`  Extra: ${d.extra_wakes}`);
      console.log(`  Wake payloads array length: ${d.wake_payloads?.length || 0}`);
      
      // Check what's in wake_payloads
      if (d.wake_payloads && d.wake_payloads.length > 0) {
        const payloadStats = {
          complete_not_overage: d.wake_payloads.filter(p => p.payload_status === 'complete' && !p.overage_flag).length,
          complete_overage: d.wake_payloads.filter(p => p.payload_status === 'complete' && p.overage_flag).length,
        };
        console.log(`  Payloads breakdown: ${payloadStats.complete_not_overage} complete, ${payloadStats.complete_overage} overage`);
      }
      console.log('');
    });
  }

  // Total from RPC
  const totalCompleted = rpcData?.devices?.reduce((sum, d) => sum + d.completed_wakes, 0) || 0;
  console.log(`\nTOTAL from RPC: ${totalCompleted} completed wakes`);
}

checkData().then(() => process.exit(0)).catch(console.error);
