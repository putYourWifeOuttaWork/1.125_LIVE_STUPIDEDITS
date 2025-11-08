import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkDevice() {
  console.log('🔍 Checking Test Device 002 status...\n');

  // Get device info
  const { data: device } = await supabase
    .from('devices')
    .select('*')
    .eq('device_name', 'Test Device 002')
    .single();

  if (!device) {
    console.log('❌ Device not found');
    return;
  }

  console.log('📱 Device Info:');
  console.log(`   Name: ${device.device_name}`);
  console.log(`   Status: ${device.provisioning_status}`);
  console.log(`   Last Seen: ${device.last_seen_at || 'Never'}`);
  console.log(`   Next Wake: ${device.next_wake_at || 'Not scheduled'}`);
  console.log('');

  // Check images
  const { data: images } = await supabase
    .from('device_images')
    .select('*')
    .eq('device_id', device.device_id);

  console.log(`📷 Images: ${images?.length || 0} total`);
  
  if (images && images.length > 0) {
    const pending = images.filter(i => i.status === 'pending');
    const receiving = images.filter(i => i.status === 'receiving');
    const complete = images.filter(i => i.status === 'complete');
    const failed = images.filter(i => i.status === 'failed');

    console.log(`   Pending: ${pending.length}`);
    console.log(`   Receiving: ${receiving.length}`);
    console.log(`   Complete: ${complete.length}`);
    console.log(`   Failed: ${failed.length}`);
    
    if (receiving.length > 0) {
      console.log('\n📥 Receiving Images:');
      receiving.forEach(img => {
        console.log(`   - ${img.image_name}`);
        console.log(`     Chunks: ${img.received_chunks || 0}/${img.total_chunks || 0}`);
        console.log(`     Retry Count: ${img.retry_count || 0}/${img.max_retries || 3}`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ Failed Images:');
      failed.forEach(img => {
        console.log(`   - ${img.image_name}`);
        console.log(`     Failed At: ${img.failed_at}`);
        console.log(`     Reason: ${img.timeout_reason || 'Unknown'}`);
        console.log(`     Retry Count: ${img.retry_count || 0}/${img.max_retries || 3}`);
      });
    }
  }

  // Check for active session
  const { data: activeSessions } = await supabase
    .from('device_sessions')
    .select('*')
    .eq('device_id', device.device_id)
    .eq('session_status', 'active');

  console.log(`\n🔄 Active Sessions: ${activeSessions?.length || 0}`);
  
  if (activeSessions && activeSessions.length > 0) {
    activeSessions.forEach(session => {
      console.log(`   Session ${session.session_id.substring(0, 8)}...`);
      console.log(`   Started: ${session.session_start_time}`);
      console.log(`   Images: ${session.images_transmitted} transmitted, ${session.images_failed} failed`);
    });
  }

  // Check pending commands
  const { data: commands } = await supabase
    .from('device_commands')
    .select('*')
    .eq('device_id', device.device_id)
    .eq('status', 'pending');

  console.log(`\n📋 Pending Commands: ${commands?.length || 0}`);
  
  if (commands && commands.length > 0) {
    commands.forEach(cmd => {
      console.log(`   - ${cmd.command_type}`);
      console.log(`     Priority: ${cmd.priority || 5}`);
      console.log(`     Scheduled: ${cmd.scheduled_for || 'Now'}`);
    });
  }
}

checkDevice().catch(console.error);
