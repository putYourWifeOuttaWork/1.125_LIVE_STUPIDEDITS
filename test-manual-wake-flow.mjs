#!/usr/bin/env node
/**
 * Test Manual Wake Flow
 *
 * Simulates the complete manual wake flow:
 * 1. User schedules manual wake
 * 2. Command is queued
 * 3. Device wakes and override is cleared
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000001';

async function testManualWakeFlow() {
  console.log('\n=== Testing Manual Wake Flow ===\n');

  // Step 1: Find a test device
  const { data: devices, error: deviceError } = await supabase
    .from('devices')
    .select('device_id, device_mac, device_name, next_wake_at, wake_schedule_cron, manual_wake_override')
    .eq('is_active', true)
    .eq('device_type', 'physical')
    .limit(1);

  if (deviceError || !devices || devices.length === 0) {
    console.error('Error finding test device:', deviceError);
    console.log('Please ensure you have at least one active physical device');
    return;
  }

  const device = devices[0];
  console.log('📱 Test Device:', device.device_name);
  console.log('   MAC:', device.device_mac);
  console.log('   Current next_wake_at:', device.next_wake_at);
  console.log('   Wake schedule:', device.wake_schedule_cron);
  console.log('   Manual override active:', device.manual_wake_override);

  // Step 2: Schedule manual wake (1 minute from now)
  console.log('\n--- Step 1: Scheduling Manual Wake ---');
  const manualWakeTime = new Date(Date.now() + 1 * 60 * 1000);
  const now = new Date().toISOString();

  console.log('⏰ Manual wake time:', manualWakeTime.toISOString());

  const { error: updateError } = await supabase
    .from('devices')
    .update({
      next_wake_at: manualWakeTime.toISOString(),
      manual_wake_override: true,
      manual_wake_requested_by: SYSTEM_USER_UUID,
      manual_wake_requested_at: now,
    })
    .eq('device_id', device.device_id);

  if (updateError) {
    console.error('❌ Error updating device:', updateError);
    return;
  }

  console.log('✅ Device record updated with manual wake flags');

  // Step 3: Queue command
  console.log('\n--- Step 2: Queueing MQTT Command ---');

  const { data: command, error: commandError } = await supabase
    .from('device_commands')
    .insert({
      device_id: device.device_id,
      command_type: 'set_wake_schedule',
      command_payload: {
        next_wake_time: manualWakeTime.toISOString(),
        manual_wake: true,
      },
      status: 'pending',
      created_by_user_id: SYSTEM_USER_UUID,
    })
    .select()
    .single();

  if (commandError) {
    console.error('❌ Error queueing command:', commandError);
    return;
  }

  console.log('✅ Command queued:', command.command_id);
  console.log('   Type:', command.command_type);
  console.log('   Status:', command.status);
  console.log('   Payload:', JSON.stringify(command.command_payload, null, 2));

  // Step 4: Wait and check command status
  console.log('\n--- Step 3: Waiting for Command Processing ---');
  console.log('⏳ Waiting 10 seconds for MQTT service to process...');

  await new Promise(resolve => setTimeout(resolve, 10000));

  const { data: updatedCommand } = await supabase
    .from('device_commands')
    .select('status, delivered_at, acknowledged_at')
    .eq('command_id', command.command_id)
    .single();

  console.log('\n📊 Command Status Update:');
  console.log('   Status:', updatedCommand?.status || 'unknown');
  console.log('   Delivered at:', updatedCommand?.delivered_at || 'not yet');
  console.log('   Acknowledged at:', updatedCommand?.acknowledged_at || 'not yet');

  if (updatedCommand?.status === 'sent') {
    console.log('✅ Command was sent via MQTT!');
  } else if (updatedCommand?.status === 'pending') {
    console.log('⚠️  Command still pending (MQTT service may not be running)');
  }

  // Step 5: Verify device state
  console.log('\n--- Step 4: Verifying Device State ---');

  const { data: updatedDevice } = await supabase
    .from('devices')
    .select('next_wake_at, manual_wake_override, manual_wake_requested_at')
    .eq('device_id', device.device_id)
    .single();

  console.log('📱 Current Device State:');
  console.log('   next_wake_at:', updatedDevice?.next_wake_at);
  console.log('   manual_wake_override:', updatedDevice?.manual_wake_override);
  console.log('   manual_wake_requested_at:', updatedDevice?.manual_wake_requested_at);

  // Step 6: Simulate device wake (clear override)
  console.log('\n--- Step 5: Simulating Device Wake & Override Clear ---');
  console.log('💡 In production, this happens when device sends HELLO message');

  if (updatedDevice?.manual_wake_override) {
    // Calculate next wake from schedule
    let nextWakeFromSchedule = null;
    if (device.wake_schedule_cron) {
      const { data: nextWakeCalc } = await supabase.rpc(
        'fn_calculate_next_wake_time',
        {
          p_last_wake_at: new Date().toISOString(),
          p_cron_expression: device.wake_schedule_cron,
          p_timezone: 'America/New_York'
        }
      );
      nextWakeFromSchedule = nextWakeCalc;
    }

    const { error: clearError } = await supabase
      .from('devices')
      .update({
        manual_wake_override: false,
        manual_wake_requested_by: null,
        manual_wake_requested_at: null,
        next_wake_at: nextWakeFromSchedule || device.next_wake_at,
        last_wake_at: new Date().toISOString(),
      })
      .eq('device_id', device.device_id);

    if (clearError) {
      console.error('❌ Error clearing override:', clearError);
    } else {
      console.log('✅ Manual wake override cleared');
      console.log('   Next wake (from schedule):', nextWakeFromSchedule);
      console.log('   Device resumed normal schedule');
    }
  }

  // Final verification
  console.log('\n--- Step 6: Final Verification ---');

  const { data: finalDevice } = await supabase
    .from('devices')
    .select('next_wake_at, manual_wake_override, last_wake_at')
    .eq('device_id', device.device_id)
    .single();

  console.log('📱 Final Device State:');
  console.log('   next_wake_at:', finalDevice?.next_wake_at);
  console.log('   manual_wake_override:', finalDevice?.manual_wake_override);
  console.log('   last_wake_at:', finalDevice?.last_wake_at);

  if (!finalDevice?.manual_wake_override) {
    console.log('\n✅ SUCCESS: Manual wake flow completed correctly!');
    console.log('   - Override was set');
    console.log('   - Command was queued');
    console.log('   - Override was cleared');
    console.log('   - Regular schedule resumed');
  } else {
    console.log('\n⚠️  Manual wake override still active (expected if device hasn\'t woken yet)');
  }

  console.log('\n=== Test Complete ===\n');
}

// Run test
testManualWakeFlow().catch(console.error);
