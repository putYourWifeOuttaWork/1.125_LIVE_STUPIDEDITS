import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Use SERVICE_ROLE key to bypass RLS
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== CHECKING WITH SERVICE ROLE (BYPASSES RLS) ===\n');

// Check 1: Computed columns on device_images
console.log('1. Checking computed columns on device_images:');
const { data: images, error: imgError } = await supabase
  .from('device_images')
  .select('image_id, captured_at, metadata, temperature, humidity, pressure, battery_voltage, rssi, status')
  .not('metadata', 'is', null)
  .order('captured_at', { ascending: false })
  .limit(10);

if (imgError) {
  console.log('❌ Error:', imgError.message);
  console.log('   Computed columns may not exist');
} else {
  console.log(`✅ Got ${images.length} images with metadata\n`);

  let withTemp = 0;
  let withHumid = 0;

  images.forEach((img, i) => {
    if (img.temperature !== null) withTemp++;
    if (img.humidity !== null) withHumid++;

    if (i < 3) {
      console.log(`Sample ${i + 1}:`);
      console.log(`  captured_at: ${img.captured_at}`);
      console.log(`  status: ${img.status}`);
      console.log(`  metadata.temperature: ${img.metadata?.temperature}`);
      console.log(`  computed temperature: ${img.temperature}`);
      console.log(`  metadata.humidity: ${img.metadata?.humidity}`);
      console.log(`  computed humidity: ${img.humidity}\n`);
    }
  });

  console.log(`Data quality: ${withTemp}/${images.length} with temperature, ${withHumid}/${images.length} with humidity\n`);
}

// Check 2: Total counts
console.log('2. Checking total counts:');
const { count: totalImages } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true });

const { count: withMetadata } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true })
  .not('metadata', 'is', null);

const { count: withTemp } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true })
  .not('temperature', 'is', null);

console.log(`Total device_images: ${totalImages}`);
console.log(`With metadata: ${withMetadata}`);
console.log(`With computed temperature: ${withTemp}\n`);

// Check 3: LOCF function
console.log('3. Checking LOCF function:');
try {
  const { data: funcTest, error: funcError } = await supabase
    .rpc('get_device_environmental_with_locf', {
      p_device_id: '11111111-1111-1111-1111-111111111111',
      p_session_id: '11111111-1111-1111-1111-111111111111',
      p_captured_at: new Date().toISOString(),
      p_wake_payload_id: null
    });

  if (funcError) {
    console.log('❌ Function error:', funcError.message);
  } else {
    console.log('✅ LOCF function exists and works!');
  }
} catch (e) {
  console.log('❌ Function does not exist or has error:', e.message);
}

// Check 4: Snapshot generation function
console.log('\n4. Checking snapshot generation function:');
const { data: funcs, error: funcListError } = await supabase
  .rpc('exec_sql', {
    sql: `
      SELECT routine_name, routine_type
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name IN ('generate_session_wake_snapshot', 'get_device_environmental_with_locf')
      ORDER BY routine_name;
    `
  });

if (!funcListError && funcs) {
  console.log('Functions found:', funcs);
} else {
  console.log('Could not query functions directly');
}

console.log('\n=== CHECK COMPLETE ===');
