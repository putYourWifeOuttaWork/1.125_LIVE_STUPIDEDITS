import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log('🔄 Regenerating snapshots for IoT Test Site 2...\n');

// Get the site
const { data: site } = await supabase
  .from('sites')
  .select('site_id, name, site_code, timezone')
  .eq('name', 'Iot Test Site 2')
  .single();

if (!site) {
  console.error('❌ IoT Test Site 2 not found!');
  process.exit(1);
}

console.log(`✅ Found site: ${site.name} (${site.site_code})`);
console.log(`   Timezone: ${site.timezone}\n`);

// Get the session for Nov 19, 2025
const sessionDate = '2025-11-19';
const { data: session } = await supabase
  .from('site_device_sessions')
  .select('session_id, session_date, status')
  .eq('site_id', site.site_id)
  .eq('session_date', sessionDate)
  .single();

if (!session) {
  console.error(`❌ No session found for ${sessionDate}!`);
  process.exit(1);
}

console.log(`✅ Found session: ${session.session_id}`);
console.log(`   Date: ${session.session_date}`);
console.log(`   Status: ${session.status}\n`);

// Check existing snapshots
const { data: existingSnapshots, count: existingCount } = await supabase
  .from('session_wake_snapshots')
  .select('*', { count: 'exact' })
  .eq('session_id', session.session_id)
  .order('snapshot_timestamp');

console.log(`📊 Existing snapshots: ${existingCount}\n`);

if (existingCount > 0) {
  console.log('🗑️  Deleting old snapshots...');
  const { error: deleteError } = await supabase
    .from('session_wake_snapshots')
    .delete()
    .eq('session_id', session.session_id);

  if (deleteError) {
    console.error('❌ Error deleting snapshots:', deleteError.message);
  } else {
    console.log('✅ Old snapshots deleted\n');
  }
}

// Generate 8 snapshots (one for each 3-hour window)
const baseDate = new Date('2025-11-19T00:00:00Z');
const snapshots = [];

for (let round = 0; round < 8; round++) {
  const windowStart = new Date(baseDate.getTime() + (round * 3 * 60 * 60 * 1000));
  const windowEnd = new Date(windowStart.getTime() + (3 * 60 * 60 * 1000));

  console.log(`\n📸 Generating snapshot ${round + 1}/8`);
  console.log(`   Window: ${windowStart.toISOString().slice(11, 16)} - ${windowEnd.toISOString().slice(11, 16)}`);

  // Call the function to generate snapshot
  const { data: snapshotResult, error: snapshotError } = await supabase
    .rpc('generate_session_wake_snapshot', {
      p_session_id: session.session_id,
      p_window_start: windowStart.toISOString(),
      p_window_end: windowEnd.toISOString()
    });

  if (snapshotError) {
    console.error(`   ❌ Error: ${snapshotError.message}`);
    continue;
  }

  console.log(`   ✅ Snapshot generated`);

  // Fetch the generated snapshot to verify
  const { data: generatedSnapshot } = await supabase
    .from('session_wake_snapshots')
    .select('snapshot_id, snapshot_data')
    .eq('session_id', session.session_id)
    .eq('snapshot_timestamp', windowStart.toISOString())
    .single();

  if (generatedSnapshot) {
    const devicesWithData = generatedSnapshot.snapshot_data.devices.filter(d => d.telemetry !== null);
    const devicesWithMgi = generatedSnapshot.snapshot_data.devices.filter(d => d.mgi_state !== null);

    console.log(`   📊 Devices: ${generatedSnapshot.snapshot_data.devices.length} total`);
    console.log(`      • ${devicesWithData.length} with telemetry data`);
    console.log(`      • ${devicesWithMgi.length} with MGI data`);

    // Show sample device with data
    const sampleDevice = devicesWithData[0];
    if (sampleDevice) {
      console.log(`   📱 Sample device (${sampleDevice.device_code}):`);
      console.log(`      • Temp: ${sampleDevice.telemetry?.latest_temperature?.toFixed(1)}°F`);
      console.log(`      • Humidity: ${sampleDevice.telemetry?.latest_humidity?.toFixed(1)}%`);
      console.log(`      • MGI: ${sampleDevice.mgi_state?.latest_mgi_score?.toFixed(3)}`);
      console.log(`      • Display color: ${sampleDevice.display?.color || 'N/A'}`);
    }
  }

  snapshots.push(generatedSnapshot);
}

console.log('\n✅ Snapshot regeneration complete!\n');
console.log('📊 Summary:');
console.log(`   • Session: ${session.session_id}`);
console.log(`   • Date: ${session.session_date}`);
console.log(`   • Snapshots generated: ${snapshots.filter(s => s).length}/8`);
console.log('\n🎬 Timeline Playback should now show:');
console.log('   • Device dots with changing colors (based on MGI)');
console.log('   • Temperature zones (blue → gray → yellow → orange → red)');
console.log('   • Humidity zones (brown → green → blue → purple → red)');
console.log('   • Battery floor circles (green → yellow → orange → red)');
console.log('   • MGI velocity pulses (animated based on growth rate)');
console.log('\n🌐 Open the Timeline Playback UI for Iot Test Site 2 to see the visualization!\n');
