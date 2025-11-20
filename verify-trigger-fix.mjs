import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking if speed trigger fix was applied...\n');

// Get the function source
const { data, error } = await supabase.rpc('exec', {
  sql: `
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'calculate_mgi_speed';
  `
});

if (error) {
  // Try alternative query
  const { data: funcData, error: funcError } = await supabase
    .from('information_schema.routines')
    .select('routine_definition')
    .eq('routine_name', 'calculate_mgi_speed')
    .eq('routine_schema', 'public')
    .single();
  
  console.log('Function exists:', !funcError);
  
  if (!funcError && funcData?.routine_definition) {
    const hasPilotPrograms = funcData.routine_definition.includes('pilot_programs');
    const hasProgramStartDate = funcData.routine_definition.includes('program_start_date');
    
    console.log('Contains "pilot_programs" join:', hasPilotPrograms ? '✅' : '❌');
    console.log('References "program_start_date":', hasProgramStartDate ? '❌ OLD VERSION' : '✅ FIXED');
    
    if (hasPilotPrograms) {
      console.log('\n✅ Speed trigger fix has been applied!');
    } else {
      console.log('\n⚠️  Speed trigger still has old code');
    }
  }
} else {
  console.log('Function check successful');
}

// Now test the triggers with a real update
console.log('\n🧪 Testing MGI triggers with real data...');

const { data: testSite } = await supabase
  .from('sites')
  .select('site_id, program_id')
  .not('program_id', 'is', null)
  .limit(1)
  .single();

if (testSite) {
  console.log('Found test site:', testSite.site_id);
  
  // Find an image from this site
  const { data: testImage } = await supabase
    .from('device_images')
    .select('image_id, device_id, site_id, captured_at')
    .eq('site_id', testSite.site_id)
    .not('device_id', 'is', null)
    .limit(1)
    .single();
  
  if (testImage) {
    console.log('Found test image:', testImage.image_id);
    
    // Update MGI score
    const testScore = 42.5;
    const { data: updated, error: updateError } = await supabase
      .from('device_images')
      .update({ mgi_score: testScore })
      .eq('image_id', testImage.image_id)
      .select('mgi_score, mgi_velocity, mgi_speed')
      .single();
    
    if (updateError) {
      console.log('❌ Update failed:', updateError.message);
    } else {
      console.log('\n✅ MGI Triggers Working:');
      console.log('   Score:', updated.mgi_score);
      console.log('   Velocity:', updated.mgi_velocity ?? 'NULL (expected for first/no prev day)');
      console.log('   Speed:', updated.mgi_speed ?? 'NULL');
      
      if (updated.mgi_speed !== null) {
        console.log('\n✅ Speed calculation SUCCESS! Trigger is fixed!');
      } else {
        console.log('\n⚠️  Speed is NULL - checking why...');
      }
    }
  } else {
    console.log('⏭️  No images found for testing');
  }
} else {
  console.log('⏭️  No sites found for testing');
}
