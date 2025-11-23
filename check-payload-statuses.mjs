import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('\n=== Wake Payload Status Breakdown ===\n');

  const { data: statuses } = await supabase
    .from('device_wake_payloads')
    .select('payload_status')
    .gte('captured_at', '2025-11-20');

  if (statuses) {
    const counts = statuses.reduce((acc, s) => {
      acc[s.payload_status] = (acc[s.payload_status] || 0) + 1;
      return acc;
    }, {});

    console.log('Status counts since Nov 20:');
    console.log(counts);
  }

  // Check if ANY have image_id set
  const { data: withImage } = await supabase
    .from('device_wake_payloads')
    .select('payload_id, image_id, payload_status, image_status')
    .gte('captured_at', '2025-11-20')
    .not('image_id', 'is', null)
    .limit(5);

  console.log('\nWake payloads WITH image_id:', withImage?.length || 0);
  if (withImage && withImage.length > 0) {
    withImage.forEach(w => {
      console.log(`  - payload: ${w.payload_status}, image: ${w.image_status}`);
    });
  }

  // Check images that should have completed
  const { data: completeImages } = await supabase
    .from('device_images')
    .select('image_id, status')
    .eq('status', 'complete')
    .gte('created_at', '2025-11-20')
    .limit(3);

  console.log('\nComplete images:', completeImages?.length || 0);

  if (completeImages && completeImages.length > 0) {
    for (const img of completeImages) {
      const { data: wake } = await supabase
        .from('device_wake_payloads')
        .select('payload_id, payload_status')
        .eq('image_id', img.image_id)
        .maybeSingle();

      console.log(`  Image ${img.image_id.substring(0, 8)}... →`, 
        wake ? `Wake ${wake.payload_status}` : 'NO WAKE FOUND');
    }
  }
}

check();
