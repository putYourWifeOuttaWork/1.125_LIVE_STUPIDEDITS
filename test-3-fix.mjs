import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

console.log('📋 TEST 3: Verify Retry Command (Fixed)\n');

const { data: device } = await supabase
  .from('devices')
  .select('device_id')
  .eq('device_mac', 'TEST-ESP32-002')
  .single();

// Check all commands for this device
const { data: commands } = await supabase
  .from('device_commands')
  .select('*')
  .eq('device_id', device.device_id)
  .eq('command_type', 'retry_image')
  .order('issued_at', { ascending: false })
  .limit(3);

console.log('📋 RETRY COMMANDS QUEUED:', commands?.length || 0);

if (commands && commands.length > 0) {
  commands.forEach((cmd, idx) => {
    console.log('\n' + (idx + 1) + '. Command ID:', cmd.command_id.substring(0, 8) + '...');
    console.log('   Type:', cmd.command_type);
    console.log('   Priority:', cmd.priority, '(8 = high)');
    console.log('   Status:', cmd.status);
    console.log('   Scheduled:', cmd.scheduled_for);
    console.log('   Expires:', cmd.expires_at);
    console.log('   Payload:', JSON.stringify(cmd.command_payload));
  });
  
  console.log('\n✅ SUCCESS: Retry commands successfully queued!');
} else {
  console.log('\n❌ No retry commands found');
}

// Check image status
const { data: image } = await supabase
  .from('device_images')
  .select('image_name, status, retry_count, max_retries, failed_at')
  .eq('image_name', 'image_1762625082788.jpg')
  .single();

console.log('\n📷 IMAGE STATUS:');
console.log('   Name:', image.image_name);
console.log('   Status:', image.status);
console.log('   Retry Count:', image.retry_count, '/', image.max_retries);
console.log('   Failed At:', image.failed_at);

console.log('\n✅ TEST 3 COMPLETE\n');
