import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

console.log('📊 TEST 1: Current Device and Image Status\n');
console.log('='.repeat(60));

// Find test device
const { data: device } = await supabase
  .from('devices')
  .select('device_id, device_name, device_mac, provisioning_status, next_wake_at, last_wake_at')
  .eq('device_mac', 'TEST-ESP32-002')
  .single();

if (!device) {
  console.log('❌ Test Device 002 not found');
  process.exit(1);
}

console.log('\n📱 DEVICE INFO:');
console.log('   Name:', device.device_name);
console.log('   MAC:', device.device_mac);
console.log('   Status:', device.provisioning_status);
console.log('   Last Wake:', device.last_wake_at || 'Never');
console.log('   Next Wake:', device.next_wake_at || 'Not scheduled');

// Check images for this device
const { data: images } = await supabase
  .from('device_images')
  .select('*')
  .eq('device_id', device.device_id)
  .order('created_at', { ascending: false });

console.log('\n📷 IMAGES:');
console.log('   Total:', images?.length || 0);

const pending = images?.filter(i => i.status === 'pending') || [];
const receiving = images?.filter(i => i.status === 'receiving') || [];
const complete = images?.filter(i => i.status === 'complete') || [];
const failed = images?.filter(i => i.status === 'failed') || [];

console.log('   • Pending:', pending.length);
console.log('   • Receiving:', receiving.length);
console.log('   • Complete:', complete.length);
console.log('   • Failed:', failed.length);

if (receiving.length > 0) {
  console.log('\n📥 RECEIVING IMAGES (incomplete transfers):');
  receiving.forEach((img, idx) => {
    console.log(`\n   ${idx + 1}. ${img.image_name}`);
    console.log('      Status:', img.status);
    console.log('      Chunks:', (img.received_chunks || 0) + '/' + (img.total_chunks || 0));
    console.log('      Retry Count:', img.retry_count || 0, '/', img.max_retries || 3);
    console.log('      Captured:', img.captured_at);
    console.log('      Failed At:', img.failed_at || 'Not failed yet');
  });
}

if (failed.length > 0) {
  console.log('\n❌ FAILED IMAGES:');
  failed.forEach((img, idx) => {
    console.log(`\n   ${idx + 1}. ${img.image_name}`);
    console.log('      Failed At:', img.failed_at);
    console.log('      Reason:', img.timeout_reason || 'Unknown');
    console.log('      Retry Count:', img.retry_count || 0, '/', img.max_retries || 3);
    console.log('      Chunks:', (img.received_chunks || 0) + '/' + (img.total_chunks || 0));
  });
}

// Check pending commands
const { data: commands } = await supabase
  .from('device_commands')
  .select('*')
  .eq('device_id', device.device_id)
  .eq('status', 'pending')
  .order('priority', { ascending: false });

console.log('\n📋 PENDING COMMANDS:', commands?.length || 0);
if (commands && commands.length > 0) {
  commands.forEach((cmd, idx) => {
    console.log(`\n   ${idx + 1}. ${cmd.command_type}`);
    console.log('      Priority:', cmd.priority || 5);
    console.log('      Status:', cmd.status);
    console.log('      Scheduled For:', cmd.scheduled_for || 'ASAP');
    console.log('      Expires At:', cmd.expires_at || 'Never');
  });
}

console.log('\n' + '='.repeat(60));
console.log('✅ TEST 1 COMPLETE\n');
