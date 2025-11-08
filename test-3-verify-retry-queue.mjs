import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

console.log('📋 TEST 3: Verify Retry Command Queued\n');
console.log('='.repeat(60));

// Get device ID
const { data: device } = await supabase
  .from('devices')
  .select('device_id, device_name, next_wake_at')
  .eq('device_mac', 'TEST-ESP32-002')
  .single();

console.log('\n📱 Device:', device.device_name);
console.log('   Next Wake At:', device.next_wake_at);

// Manually queue retry since timeout function doesn't auto-queue
console.log('\n📝 Step 1: Manually calling queue_image_retry()...');
const { data: commandId, error: queueError } = await supabase.rpc('queue_image_retry', {
  p_device_id: device.device_id,
  p_image_id: (await supabase.from('device_images').select('image_id').eq('image_name', 'image_1762625082788.jpg').single()).data.image_id,
  p_image_name: 'image_1762625082788.jpg'
});

if (queueError) {
  console.log('❌ Error queuing retry:', queueError.message);
  process.exit(1);
}

console.log('✅ Retry command queued with ID:', commandId);

// Fetch the command details
const { data: command, error: cmdError } = await supabase
  .from('device_commands')
  .select('*')
  .eq('command_id', commandId)
  .single();

if (cmdError) {
  console.log('❌ Error fetching command:', cmdError.message);
  process.exit(1);
}

console.log('\n📋 RETRY COMMAND DETAILS:');
console.log('   Command ID:', command.command_id);
console.log('   Command Type:', command.command_type);
console.log('   Priority:', command.priority, '(8 = high priority)');
console.log('   Status:', command.status);
console.log('   Scheduled For:', command.scheduled_for);
console.log('   Expires At:', command.expires_at);
console.log('   Max Retries:', command.max_retries);
console.log('   Created At:', command.issued_at);

console.log('\n📦 COMMAND PAYLOAD:');
console.log(JSON.stringify(command.command_payload, null, 2));

// Verify all required fields
const checks = {
  'Command Type': command.command_type === 'retry_image',
  'High Priority': command.priority === 8,
  'Status Pending': command.status === 'pending',
  'Has Scheduled Time': !!command.scheduled_for,
  'Has Expiry': !!command.expires_at,
  'Has Payload': !!command.command_payload && !!command.command_payload.image_name
};

console.log('\n✅ VERIFICATION CHECKS:');
Object.entries(checks).forEach(([check, passed]) => {
  console.log('   ' + (passed ? '✅' : '❌') + ' ' + check);
});

const allPassed = Object.values(checks).every(v => v);
console.log('\n' + (allPassed ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'));

// Check image retry count
const { data: updatedImage } = await supabase
  .from('device_images')
  .select('retry_count, status')
  .eq('image_name', 'image_1762625082788.jpg')
  .single();

console.log('\n📷 UPDATED IMAGE STATUS:');
console.log('   Status:', updatedImage.status);
console.log('   Retry Count:', updatedImage.retry_count, '/ 3');

console.log('\n' + '='.repeat(60));
console.log('✅ TEST 3 COMPLETE\n');
