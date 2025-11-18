import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n🔍 VERIFYING LAB DATA\n');

// Check devices
console.log('1️⃣ Devices:');
const { data: devices } = await supabase
  .from('devices')
  .select('device_id, device_name, device_code, x_position, y_position')
  .like('device_code', 'LAB%')
  .order('device_code');

const deviceCount = devices ? devices.length : 0;
console.log(`   Found ${deviceCount} lab devices:`);
if (devices) {
  devices.forEach(d => {
    console.log(`   - ${d.device_name} (${d.device_code}) at (${d.x_position}, ${d.y_position})`);
  });
}

// Check wake payloads
console.log('\n2️⃣ Wake Payloads:');
const { data: payloads } = await supabase
  .from('device_wake_payloads')
  .select('payload_id, device_id, captured_at, payload_status')
  .order('captured_at', { ascending: false })
  .limit(5);

const payloadCount = payloads ? payloads.length : 0;
console.log(`   Found ${payloadCount} recent payloads`);

// Check images
console.log('\n3️⃣ Device Images:');
const { data: images } = await supabase
  .from('device_images')
  .select('image_id, image_name, status')
  .order('captured_at', { ascending: false })
  .limit(5);

const imageCount = images ? images.length : 0;
console.log(`   Found ${imageCount} recent images`);
if (images) {
  images.forEach(img => {
    console.log(`   - ${img.image_name} (${img.status})`);
  });
}

// Check vw_ingest_live view
console.log('\n4️⃣ Ingest Live View:');
const { data: liveData, error: liveError } = await supabase
  .from('vw_ingest_live')
  .select('kind, device_name, ts')
  .order('ts', { ascending: false })
  .limit(10);

if (liveError) {
  console.log(`   ❌ Error: ${liveError.message}`);
} else {
  const liveCount = liveData ? liveData.length : 0;
  console.log(`   Found ${liveCount} events in live view:`);
  if (liveData) {
    liveData.forEach(e => {
      console.log(`   - ${e.kind} from ${e.device_name}`);
    });
  }
}

console.log('\n✅ Verification complete!\n');
