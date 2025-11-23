import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  console.log('\n=== Diagnosing Image-Wake Linkage Issue ===\n');

  // Check wake payloads with NULL image_id
  const { data: wakesNoImage } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, device_id, captured_at, payload_status, image_id')
    .gte('captured_at', '2025-11-23T00:00:00Z')
    .is('image_id', null)
    .limit(5);

  console.log('Wake payloads with NULL image_id:', wakesNoImage?.length || 0);
  
  if (wakesNoImage && wakesNoImage.length > 0) {
    console.log('\nSample wake payloads:');
    wakesNoImage.forEach(w => {
      console.log(`  - Payload: ${w.payload_id.substring(0, 8)}... device: ${w.device_id.substring(0, 8)}... status: ${w.payload_status}`);
    });
  }

  // Check if images have device_id that match wake payloads
  const { data: images } = await supabase
    .from('device_images')
    .select('image_id, device_id, image_name, created_at')
    .gte('created_at', '2025-11-23T00:00:00Z')
    .limit(5);

  console.log('\n📸 Recent images:', images?.length || 0);
  
  if (images && images.length > 0 && wakesNoImage && wakesNoImage.length > 0) {
    console.log('\n🔍 Checking if devices match...');
    
    const imageDevices = images.map(i => i.device_id);
    const wakeDevices = wakesNoImage.map(w => w.device_id);
    
    console.log('Image devices:', imageDevices);
    console.log('Wake devices:', wakeDevices);
    
    const match = imageDevices.some(id => wakeDevices.includes(id));
    console.log('\nDevices match?', match ? 'YES' : 'NO');
    
    // Try to find matching by device and time
    for (const img of images) {
      const matchingWake = wakesNoImage.find(w =>
        w.device_id === img.device_id &&
        new Date(w.captured_at).getTime() <= new Date(img.created_at).getTime()
      );
      
      if (matchingWake) {
        console.log(`\n✅ FOUND MATCH:`);
        console.log(`   Image: ${img.image_id.substring(0, 8)}... at ${img.created_at}`);
        console.log(`   Wake:  ${matchingWake.payload_id.substring(0, 8)}... at ${matchingWake.captured_at}`);
        console.log(`   Wake should have image_id = ${img.image_id}`);
      }
    }
  }
}

diagnose();
