import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🧪 Testing MGI Triggers After Fix\n');

// Find a site with a program
const { data: site } = await supabase
  .from('sites')
  .select('site_id, site_name, program_id')
  .not('program_id', 'is', null)
  .limit(1)
  .single();

if (!site) {
  console.log('❌ No sites with programs found');
  process.exit(1);
}

console.log('Test site:', site.site_name);

// Find or create a test image
const { data: device } = await supabase
  .from('devices')
  .select('device_id')
  .eq('site_id', site.site_id)
  .limit(1)
  .single();

if (!device) {
  console.log('❌ No devices at this site');
  process.exit(1);
}

// Find an existing image or check if we can update one
const { data: existingImage } = await supabase
  .from('device_images')
  .select('image_id, mgi_score')
  .eq('device_id', device.device_id)
  .eq('site_id', site.site_id)
  .limit(1)
  .single();

if (!existingImage) {
  console.log('❌ No images found for testing');
  process.exit(1);
}

console.log('Test image:', existingImage.image_id);
console.log('Current MGI:', existingImage.mgi_score || 'NULL');

// Update with a test score
const testScore = 55.75;
console.log(`\nUpdating MGI score to ${testScore}...`);

const { data: result, error } = await supabase
  .from('device_images')
  .update({ mgi_score: testScore })
  .eq('image_id', existingImage.image_id)
  .select('mgi_score, mgi_velocity, mgi_speed')
  .single();

if (error) {
  console.log('❌ Error:', error.message);
  console.log('\n⚠️  The trigger fix may not have been applied correctly.');
  console.log('Please re-run FIX_MGI_SPEED_TRIGGER.sql in Supabase SQL Editor');
  process.exit(1);
}

console.log('\n✅ Update successful!');
console.log('   MGI Score:', result.mgi_score);
console.log('   MGI Velocity:', result.mgi_velocity ?? 'NULL (no previous day data)');
console.log('   MGI Speed:', result.mgi_speed ?? 'NULL');

if (result.mgi_speed !== null && result.mgi_speed !== undefined) {
  console.log('\n🎉 MGI Speed calculation is WORKING!');
  console.log('   The trigger fix has been successfully applied!');
} else {
  console.log('\n⚠️  Speed is NULL - this might be normal if the site has no program start date');
  
  // Check if program has start date
  const { data: program } = await supabase
    .from('pilot_programs')
    .select('start_date')
    .eq('program_id', site.program_id)
    .single();
  
  if (program?.start_date) {
    console.log('   Program start date exists:', program.start_date);
    console.log('   ❌ Trigger may still have an issue');
  } else {
    console.log('   Program has no start_date - speed calculation cannot run');
  }
}

// Check if device was updated
const { data: deviceCheck } = await supabase
  .from('devices')
  .select('latest_mgi_score, latest_mgi_velocity, latest_mgi_at')
  .eq('device_id', device.device_id)
  .single();

console.log('\n📊 Device latest values:');
console.log('   Latest MGI Score:', deviceCheck?.latest_mgi_score ?? 'NULL');
console.log('   Latest MGI Velocity:', deviceCheck?.latest_mgi_velocity ?? 'NULL');
console.log('   Latest MGI At:', deviceCheck?.latest_mgi_at ?? 'NULL');

if (deviceCheck?.latest_mgi_score === testScore) {
  console.log('\n✅ Device update trigger is WORKING!');
} else {
  console.log('\n⚠️  Device may not have updated (could be timing or older image)');
}
