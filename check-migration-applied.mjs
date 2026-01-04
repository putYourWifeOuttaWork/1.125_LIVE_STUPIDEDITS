import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

console.log('=== CHECKING MIGRATION STATE ===\n');

// Check 1: Do computed columns exist and have data?
console.log('1. Checking computed columns on device_images:');
const { data: recentImages, error: imgError } = await supabase
  .from('device_images')
  .select('id, captured_at, metadata, temperature, humidity, pressure, battery_voltage, rssi')
  .not('metadata', 'is', null)
  .order('captured_at', { ascending: false })
  .limit(10);

if (imgError) {
  console.log('❌ Error querying device_images:', imgError.message);
  console.log('   This suggests the computed columns do NOT exist yet');
} else {
  console.log(`✅ Successfully queried ${recentImages.length} rows\n`);

  let withTemp = 0;
  let withHumid = 0;
  let withMetadata = 0;

  recentImages.forEach((row, i) => {
    if (row.metadata) withMetadata++;
    if (row.temperature !== null) withTemp++;
    if (row.humidity !== null) withHumid++;

    if (i < 3) {
      console.log(`Sample ${i + 1}:`);
      console.log(`  captured_at: ${row.captured_at}`);
      console.log(`  metadata.temperature: ${row.metadata?.temperature}`);
      console.log(`  computed temperature: ${row.temperature}`);
      console.log(`  metadata.humidity: ${row.metadata?.humidity}`);
      console.log(`  computed humidity: ${row.humidity}\n`);
    }
  });

  console.log(`Summary of ${recentImages.length} recent images:`);
  console.log(`  With metadata: ${withMetadata}`);
  console.log(`  With computed temperature: ${withTemp}`);
  console.log(`  With computed humidity: ${withHumid}\n`);
}

// Check 2: Does LOCF function exist?
console.log('2. Checking LOCF helper function:');
try {
  const { data: locfTest, error: locfError } = await supabase
    .rpc('get_environmental_data_with_locf', {
      p_device_id: '11111111-1111-1111-1111-111111111111',
      p_captured_at: new Date().toISOString()
    });

  if (locfError) {
    console.log('❌ LOCF function not found:', locfError.message);
  } else {
    console.log('✅ LOCF function exists and works!');
    console.log('   Result:', locfTest);
  }
} catch (e) {
  console.log('❌ LOCF function error:', e.message);
}

// Check 3: Check session_wake_snapshots columns
console.log('\n3. Checking session_wake_snapshots for device_images columns:');
const { data: snapshots, error: snapError } = await supabase
  .from('session_wake_snapshots')
  .select('snapshot_time, device_image_id, avg_temperature, avg_humidity, avg_pressure')
  .not('device_image_id', 'is', null)
  .order('snapshot_time', { ascending: false })
  .limit(5);

if (snapError) {
  console.log('❌ Error:', snapError.message);
  console.log('   Columns may not exist yet');
} else {
  console.log(`✅ Successfully queried ${snapshots.length} snapshots with device_image_id\n`);
  snapshots.forEach((snap, i) => {
    console.log(`Snapshot ${i + 1}:`);
    console.log(`  Time: ${snap.snapshot_time}`);
    console.log(`  device_image_id: ${snap.device_image_id}`);
    console.log(`  avg_temperature: ${snap.avg_temperature}`);
    console.log(`  avg_humidity: ${snap.avg_humidity}\n`);
  });
}

console.log('=== CHECK COMPLETE ===');
