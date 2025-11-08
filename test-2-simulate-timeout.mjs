import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

console.log('⏱️  TEST 2: Simulate Timeout and Verify Detection\n');
console.log('='.repeat(60));

// Step 1: Set next_wake_at to past (5 minutes ago)
console.log('\n📝 Step 1: Setting next_wake_at to 5 minutes ago...');
const { data: updateResult, error: updateError } = await supabase
  .from('devices')
  .update({ next_wake_at: new Date(Date.now() - 5 * 60 * 1000).toISOString() })
  .eq('device_mac', 'TEST-ESP32-002')
  .select();

if (updateError) {
  console.log('❌ Error updating device:', updateError.message);
  process.exit(1);
}

console.log('✅ Device next_wake_at updated to:', updateResult[0].next_wake_at);

// Step 2: Call timeout_stale_images function
console.log('\n📝 Step 2: Calling timeout_stale_images()...');
const { data: timeoutResults, error: timeoutError } = await supabase.rpc('timeout_stale_images');

if (timeoutError) {
  console.log('❌ Error calling timeout function:', timeoutError.message);
  process.exit(1);
}

console.log('✅ Function executed successfully');
console.log('   Timed out images:', timeoutResults?.length || 0);

if (timeoutResults && timeoutResults.length > 0) {
  timeoutResults.forEach((result, idx) => {
    console.log('\n   Image ' + (idx + 1) + ':');
    console.log('      Name:', result.image_name);
    console.log('      Timed Out:', result.timed_out);
  });
}

// Step 3: Verify image status changed to failed
console.log('\n📝 Step 3: Verifying image status changed to failed...');
const { data: image, error: imageError } = await supabase
  .from('device_images')
  .select('*')
  .eq('image_name', 'image_1762625082788.jpg')
  .single();

if (imageError) {
  console.log('❌ Error fetching image:', imageError.message);
  process.exit(1);
}

console.log('✅ Image Status After Timeout:');
console.log('   Status:', image.status);
console.log('   Failed At:', image.failed_at);
console.log('   Timeout Reason:', image.timeout_reason);
console.log('   Retry Count:', image.retry_count, '/', image.max_retries);

// Verify it's actually failed
if (image.status === 'failed') {
  console.log('\n✅ SUCCESS: Image correctly marked as failed!');
} else {
  console.log('\n❌ FAIL: Image status is still:', image.status);
}

console.log('\n' + '='.repeat(60));
console.log('✅ TEST 2 COMPLETE\n');
