import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

console.log('🎨 TEST 5: UI Data Check\n');
console.log('='.repeat(60));

// Get device with images
const { data: device } = await supabase
  .from('devices')
  .select('device_id, device_name, device_mac')
  .eq('device_mac', 'TEST-ESP32-002')
  .single();

const { data: images } = await supabase
  .from('device_images')
  .select('image_id, image_name, status, retry_count, max_retries')
  .eq('device_id', device.device_id);

const pending = images?.filter(i => i.status === 'pending').length || 0;
const receiving = images?.filter(i => i.status === 'receiving').length || 0;
const failed = images?.filter(i => i.status === 'failed').length || 0;
const complete = images?.filter(i => i.status === 'complete').length || 0;

console.log('\n📱 DEVICE:', device.device_name);
console.log('\n📷 IMAGE COUNTS (for UI badges):');
console.log('   Total Images:', images?.length || 0);
console.log('   ⏳ Pending:', pending);
console.log('   📥 Receiving:', receiving, '(yellow badge)');
console.log('   ❌ Failed:', failed, '(red badge)');
console.log('   ✅ Complete:', complete);

console.log('\n🎨 UI SHOULD SHOW:');
if (receiving > 0) {
  console.log('   📍 Device List: Yellow badge [' + receiving + ' pending]');
}
if (failed > 0) {
  console.log('   📍 Device List: Red badge [' + failed + ' failed]');
}
if (failed > 0) {
  console.log('   📍 Device Detail: Failed images section with retry button');
}

// Check commands
const { data: commands } = await supabase
  .from('device_commands')
  .select('command_type, status, priority')
  .eq('device_id', device.device_id)
  .eq('status', 'pending');

console.log('\n📋 PENDING COMMANDS:', commands?.length || 0);
if (commands && commands.length > 0) {
  commands.forEach(cmd => {
    console.log('   • ' + cmd.command_type + ' (priority: ' + cmd.priority + ')');
  });
}

console.log('\n' + '='.repeat(60));
console.log('\n✅ NEXT STEP: Hard refresh browser (Cmd+Shift+R)');
console.log('   Then navigate to /devices to see badges');
console.log('\n✅ TEST 5 COMPLETE\n');
