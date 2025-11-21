#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkSnapshotData() {
  console.log('🔍 Checking snapshot data structure...\n');

  // Get a recent snapshot
  const { data: snapshots, error } = await supabase
    .from('session_wake_snapshots')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('❌ Error fetching snapshots:', error);
    return;
  }

  if (!snapshots || snapshots.length === 0) {
    console.log('⚠️  No snapshots found in database');
    return;
  }

  const snapshot = snapshots[0];
  console.log('✅ Found snapshot:', snapshot.snapshot_id);
  console.log('   Session:', snapshot.session_id);
  console.log('   Site:', snapshot.site_id);
  console.log('   Wake:', snapshot.wake_number);
  console.log('   Time:', snapshot.wake_round_start);
  console.log('   Active devices:', snapshot.active_devices_count);
  console.log('   Avg MGI:', snapshot.avg_mgi);
  console.log('   Avg Temp:', snapshot.avg_temperature);
  console.log('   Avg Humidity:', snapshot.avg_humidity);
  console.log('');

  // Parse site_state
  const siteState = typeof snapshot.site_state === 'string'
    ? JSON.parse(snapshot.site_state)
    : snapshot.site_state;

  console.log('📊 Site State Structure:');
  console.log('   Keys:', Object.keys(siteState));
  console.log('');

  if (siteState.devices && siteState.devices.length > 0) {
    const device = siteState.devices[0];
    console.log('🔧 Sample Device Data:');
    console.log(JSON.stringify(device, null, 2));
    console.log('');

    // Check what data is present
    console.log('📋 Device Fields Present:');
    console.log('   device_id:', !!device.device_id);
    console.log('   device_code:', !!device.device_code);
    console.log('   position:', !!device.position);
    console.log('   position.x:', device.position?.x);
    console.log('   position.y:', device.position?.y);
    console.log('   battery_health_percent:', device.battery_health_percent);
    console.log('   status:', device.status);
    console.log('   telemetry:', !!device.telemetry);
    if (device.telemetry) {
      console.log('     temperature:', device.telemetry.temperature);
      console.log('     humidity:', device.telemetry.humidity);
    }
    console.log('   mgi_state:', !!device.mgi_state);
    if (device.mgi_state) {
      console.log('     mgi_score:', device.mgi_state.mgi_score);
      console.log('     mgi_velocity:', device.mgi_state.mgi_velocity);
    }
  } else {
    console.log('⚠️  No devices in snapshot');
  }
}

checkSnapshotData().then(() => process.exit(0));
