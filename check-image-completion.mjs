import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('\n=== Checking Images and Wake Payload Status ===\n');

  // Get recent images
  const { data: images } = await supabase
    .from('device_images')
    .select('image_id, device_id, status, image_name, created_at')
    .gte('created_at', '2025-11-23T00:00:00Z')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Recent images:', images?.length || 0);
  
  if (images && images.length > 0) {
    for (const img of images) {
      console.log(`\n📸 Image: ${img.image_name}`);
      console.log(`   Status: ${img.status}`);
      console.log(`   Created: ${img.created_at}`);

      // Find corresponding wake payload
      const { data: wakes } = await supabase
        .from('device_wake_payloads')
        .select('payload_id, payload_status, image_status, captured_at')
        .eq('image_id', img.image_id);

      if (wakes && wakes.length > 0) {
        console.log(`   Wake Payload: ${wakes[0].payload_status} / image: ${wakes[0].image_status}`);
      } else {
        console.log('   ⚠️  NO WAKE PAYLOAD FOUND FOR THIS IMAGE');
      }
    }
  }
}

check();
