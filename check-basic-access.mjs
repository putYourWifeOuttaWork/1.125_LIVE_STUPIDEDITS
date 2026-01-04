import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

console.log('=== CHECKING BASIC DATABASE ACCESS ===\n');

// Try simple count query
console.log('1. Simple count of device_images:');
const { count, error: countError } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true });

if (countError) {
  console.log('❌ Error:', countError.message);
} else {
  console.log(`✅ Total rows: ${count}`);
}

// Try fetching just a few rows without specifying columns
console.log('\n2. Fetching recent images (no column selection):');
const { data: images1, error: err1 } = await supabase
  .from('device_images')
  .select()
  .order('created_at', { ascending: false })
  .limit(3);

if (err1) {
  console.log('❌ Error:', err1.message);
} else {
  console.log(`✅ Got ${images1.length} rows`);
  if (images1.length > 0) {
    console.log('Available columns:', Object.keys(images1[0]));
    console.log('\nFirst row sample:');
    const first = images1[0];
    console.log('  captured_at:', first.captured_at);
    console.log('  Has metadata:', !!first.metadata);
    console.log('  Has temperature column:', 'temperature' in first);
    console.log('  temperature value:', first.temperature);
    console.log('  Has humidity column:', 'humidity' in first);
    console.log('  humidity value:', first.humidity);
  }
}

// Check session_wake_snapshots columns
console.log('\n3. Checking session_wake_snapshots:');
const { data: snaps, error: snapErr } = await supabase
  .from('session_wake_snapshots')
  .select()
  .limit(1);

if (snapErr) {
  console.log('❌ Error:', snapErr.message);
} else {
  console.log('✅ Got snapshot data');
  if (snaps.length > 0) {
    console.log('Available columns:', Object.keys(snaps[0]));
    console.log('Has device_image_id:', 'device_image_id' in snaps[0]);
    console.log('Has avg_temperature:', 'avg_temperature' in snaps[0]);
  }
}

console.log('\n=== CHECK COMPLETE ===');
