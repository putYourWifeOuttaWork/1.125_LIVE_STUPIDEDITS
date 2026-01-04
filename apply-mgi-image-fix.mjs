import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('🔧 Applying MGI Image Fields Migration...');

  try {
    console.log('📋 Migration file created at:');
    console.log('   supabase/migrations/20260104000000_add_mgi_to_session_images.sql');
    console.log('\n🧪 Testing current function to see if migration is needed...');

    const { data: sessions } = await supabase
      .from('site_device_sessions')
      .select('session_id')
      .order('session_date', { ascending: false })
      .limit(1);

    if (sessions && sessions.length > 0) {
      const { data: result, error: rpcError } = await supabase.rpc('get_session_devices_with_wakes', {
        p_session_id: sessions[0].session_id
      });

      if (rpcError) {
        console.log('⚠️  Function may need manual application');
        console.log('   Error:', rpcError.message);
        console.log('\n📋 Please apply the migration manually:');
        console.log('   1. Go to Supabase Dashboard > SQL Editor');
        console.log('   2. Copy content from: supabase/migrations/20260104000000_add_mgi_to_session_images.sql');
        console.log('   3. Execute the SQL');
      } else if (result) {
        const totalImages = result.devices?.reduce((count, d) => count + (d.images?.length || 0), 0);
        const imagesWithMGI = result.devices?.reduce((count, d) => {
          return count + (d.images?.filter(img => img.mgi_score != null).length || 0);
        }, 0);

        console.log('   Total devices:', result.devices?.length || 0);
        console.log('   Total images:', totalImages);
        console.log('   Images with MGI scores:', imagesWithMGI);

        // Check if MGI fields are present in the structure
        const sampleImage = result.devices?.find(d => d.images?.length > 0)?.images?.[0];
        const hasMGIFields = sampleImage && ('mgi_score' in sampleImage || 'mgi_velocity' in sampleImage);

        if (hasMGIFields) {
          console.log('   ✅ MGI fields are NOW included in the function!');
          console.log('\n✅ Migration applied successfully!');
        } else {
          console.log('   ⚠️  MGI fields not yet in function output');
          console.log('\n📋 Manual application required. See file:');
          console.log('   supabase/migrations/20260104000000_add_mgi_to_session_images.sql');
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📋 Please apply the migration manually using the Supabase dashboard:');
    console.log('   File: supabase/migrations/20260104000000_add_mgi_to_session_images.sql');
    console.log('\n   Steps:');
    console.log('   1. Open Supabase Dashboard');
    console.log('   2. Go to SQL Editor');
    console.log('   3. Copy and paste the SQL from the migration file');
    console.log('   4. Execute');
    process.exit(1);
  }
}

applyMigration();
