import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: images } = await supabase
    .from('device_images')
    .select('image_id, image_name, image_url, device_id, status, created_at')
    .gte('created_at', '2025-11-23')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n=== Recent Images ===\n');
  images?.forEach(img => {
    console.log('Image:', img.image_name || 'unnamed');
    console.log('  URL:', img.image_url);
    console.log('  Device:', img.device_id ? img.device_id.substring(0, 8) + '...' : 'NULL');
    console.log('  Status:', img.status);
    console.log('  Created:', img.created_at);
    console.log('');
  });

  // Check if these are test URLs or real device images
  const testUrls = images?.filter(i => i.image_url && (
    i.image_url.includes('sciencephoto.com') ||
    i.image_url.includes('immunolytics.com') ||
    i.image_url.includes('website-files.com')
  ));

  console.log('Test/Stock images:', testUrls?.length || 0, 'of', images?.length || 0);
  console.log('These are NOT from real devices - they are test data!');
}

check();
