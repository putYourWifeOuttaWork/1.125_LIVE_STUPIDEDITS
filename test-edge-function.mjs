import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

console.log('🔧 TEST 4: Test Edge Function\n');
console.log('='.repeat(60));

const functionUrl = supabaseUrl + '/functions/v1/monitor_image_timeouts';

console.log('\n📡 Calling edge function...');
console.log('   URL:', functionUrl);

const response = await fetch(functionUrl, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + serviceKey,
    'Content-Type': 'application/json'
  }
});

const result = await response.json();

console.log('\n📊 RESPONSE:');
console.log('   Status:', response.status);
console.log('   Success:', result.success);

if (result.summary) {
  console.log('\n📈 SUMMARY:');
  console.log('   Images Timed Out:', result.summary.images_timed_out);
  console.log('   Retries Queued:', result.summary.retries_queued);
  console.log('   Failed to Queue:', result.summary.failed_to_queue);
}

if (result.processed_images && result.processed_images.length > 0) {
  console.log('\n✅ PROCESSED IMAGES:');
  result.processed_images.forEach((img, idx) => {
    console.log('   ' + (idx + 1) + '. ' + img);
  });
}

if (result.failed_images && result.failed_images.length > 0) {
  console.log('\n❌ FAILED IMAGES:');
  result.failed_images.forEach((img, idx) => {
    console.log('   ' + (idx + 1) + '. ' + img);
  });
}

if (result.error) {
  console.log('\n❌ ERROR:', result.error);
}

console.log('\n' + '='.repeat(60));

// Now check if commands were created
console.log('\n📋 Checking for queued commands...');
const supabase = createClient(supabaseUrl, serviceKey);

const { data: device } = await supabase
  .from('devices')
  .select('device_id')
  .eq('device_mac', 'TEST-ESP32-002')
  .single();

const { data: commands } = await supabase
  .from('device_commands')
  .select('*')
  .eq('device_id', device.device_id)
  .eq('command_type', 'retry_image')
  .order('issued_at', { ascending: false })
  .limit(1);

if (commands && commands.length > 0) {
  console.log('\n✅ RETRY COMMAND FOUND:');
  const cmd = commands[0];
  console.log('   Command Type:', cmd.command_type);
  console.log('   Priority:', cmd.priority);
  console.log('   Status:', cmd.status);
  console.log('   Payload:', JSON.stringify(cmd.command_payload, null, 2));
} else {
  console.log('\n❌ No retry commands found');
}

console.log('\n✅ TEST 4 COMPLETE\n');
