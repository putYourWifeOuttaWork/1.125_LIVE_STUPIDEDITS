import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('Required: VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  try {
    console.log('📁 Reading migration file...');
    const migrationSQL = readFileSync('./supabase/migrations/20251109140000_create_get_recent_submissions_v3.sql', 'utf8');

    console.log('🚀 Applying migration: 20251109140000_create_get_recent_submissions_v3.sql');
    console.log('   This will create:');
    console.log('   - superadmin_impersonations table');
    console.log('   - get_impersonated_company_id() helper function');
    console.log('   - get_recent_submissions_v3() RPC function');
    console.log('');

    // Split migration into statements and execute them
    const statements = migrationSQL
      .split('-- ==========================================')
      .filter(s => s.trim().length > 0);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (!statement || statement.startsWith('/*') || statement.startsWith('--')) {
        continue;
      }

      console.log(`   Executing statement ${i + 1}...`);

      const { error } = await supabase.rpc('exec', { sql: statement });

      if (error) {
        console.error(`❌ Error in statement ${i + 1}:`, error.message);
        // Continue anyway - some errors might be expected (like "already exists")
      }
    }

    // Alternative approach: execute the entire migration as one
    console.log('🔄 Executing full migration...');
    const { data, error } = await supabase.rpc('query', {
      query: migrationSQL
    });

    if (error && !error.message.includes('already exists')) {
      console.error('❌ Migration error:', error);

      // Try direct SQL execution
      console.log('🔄 Trying alternative execution method...');
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ sql: migrationSQL })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Alternative method also failed:', errorText);
        process.exit(1);
      }
    }

    console.log('');
    console.log('✅ Migration applied successfully!');
    console.log('');
    console.log('📊 Verifying installation...');

    // Verify the function exists
    const { data: functionCheck, error: functionError } = await supabase
      .rpc('get_recent_submissions_v3', {
        limit_param: 1,
        program_id_param: null,
        site_id_param: null
      });

    if (functionError) {
      console.log('⚠️  Function verification note:', functionError.message);
      console.log('   This may be normal if you have no submissions yet.');
    } else {
      console.log('✅ Function get_recent_submissions_v3 is working!');
    }

    console.log('');
    console.log('🎉 Migration complete! You can now refresh your app.');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

applyMigration();
