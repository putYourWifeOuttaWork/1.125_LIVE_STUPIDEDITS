import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

console.log('=== DETAILED SNAPSHOTS CHECK ===\n');

// Get recent snapshots with all columns
const { data: snaps, error: snapErr } = await supabase
  .from('session_wake_snapshots')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(5);

if (snapErr) {
  console.log('❌ Error:', snapErr.message);
} else {
  console.log(`✅ Got ${snaps.length} snapshots\n`);

  if (snaps.length > 0) {
    console.log('Available columns:', Object.keys(snaps[0]).sort().join(', '));

    console.log('\n--- Sample Snapshots ---');
    snaps.forEach((snap, i) => {
      console.log(`\nSnapshot ${i + 1}:`);
      console.log('  created_at:', snap.created_at);
      console.log('  session_id:', snap.session_id);

      // Check for device_image_id column
      if ('device_image_id' in snap) {
        console.log('  ✅ device_image_id exists:', snap.device_image_id);
      } else {
        console.log('  ❌ device_image_id column does NOT exist');
      }

      // Check for environmental columns
      if ('avg_temperature' in snap) {
        console.log('  ✅ avg_temperature:', snap.avg_temperature);
      } else {
        console.log('  ❌ avg_temperature column does NOT exist');
      }

      if ('avg_humidity' in snap) {
        console.log('  ✅ avg_humidity:', snap.avg_humidity);
      } else {
        console.log('  ❌ avg_humidity column does NOT exist');
      }

      // Show what env data exists
      console.log('  temperature (legacy):', snap.temperature);
      console.log('  humidity (legacy):', snap.humidity);
    });
  }
}

console.log('\n=== CHECK COMPLETE ===');
