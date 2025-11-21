#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkData() {
  console.log('🔍 Checking for snapshots with actual data...\n');

  // Get snapshots around Nov 14-15 where we know data exists
  const { data: snapshots } = await supabase
    .from('session_wake_snapshots')
    .select('*')
    .eq('site_id', '4a21ccd9-56c5-48b2-90ca-c5fb756803d6')
    .gte('wake_round_end', '2025-11-14T00:00:00Z')
    .lte('wake_round_end', '2025-11-16T00:00:00Z')
    .order('wake_round_start', { ascending: true });

  console.log(`📊 Snapshots between Nov 14-16: ${snapshots?.length || 0}\n`);

  if (snapshots && snapshots.length > 0) {
    snapshots.forEach(s => {
      const siteState = typeof s.site_state === 'string'
        ? JSON.parse(s.site_state)
        : s.site_state;
      const devices = siteState.devices || [];
      const device = devices[0];

      console.log(`Wake #${s.wake_number} (${s.wake_round_end}):`);
      console.log(`  Avg Temp: ${s.avg_temperature}°F`);
      console.log(`  Avg Humidity: ${s.avg_humidity}%`);
      if (device) {
        console.log(`  Device telemetry: ${device.telemetry ? '✅' : '❌'}`);
        if (device.telemetry) {
          console.log(`    - Temp: ${device.telemetry.temperature}°F`);
          console.log(`    - Humidity: ${device.telemetry.humidity}%`);
        }
      }
      console.log('');
    });
  }

  console.log('\n📍 If you see data above, refresh the Timeline Playback page!');
  console.log('   The device dots should now show colors based on temperature/humidity.');
}

checkData().then(() => process.exit(0));
