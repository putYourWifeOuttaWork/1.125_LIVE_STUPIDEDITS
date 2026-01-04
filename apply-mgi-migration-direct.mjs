import pg from 'pg';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Extract project reference from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
  console.error('❌ Could not parse project reference from Supabase URL');
  process.exit(1);
}

// Construct connection string for direct database access
// Note: You'll need the database password from Supabase dashboard
console.log('🔧 MGI Image Fields Migration');
console.log('\n📋 Migration file: supabase/migrations/20260104000000_add_mgi_to_session_images.sql');

console.log('\n⚠️  Direct database connection not available');
console.log('\n📝 Please apply this migration manually:');
console.log('\n   Option 1: Supabase Dashboard (Recommended)');
console.log('   ------------------------------------------');
console.log('   1. Open https://supabase.com/dashboard/project/' + projectRef);
console.log('   2. Go to SQL Editor');
console.log('   3. Create new query');
console.log('   4. Copy/paste content from: supabase/migrations/20260104000000_add_mgi_to_session_images.sql');
console.log('   5. Click "Run"');

console.log('\n   Option 2: Supabase CLI');
console.log('   ----------------------');
console.log('   supabase db push --include-all');

console.log('\n   Option 3: Copy SQL below and paste in SQL Editor:');
console.log('   -------------------------------------------------\n');

const migrationSQL = readFileSync('./supabase/migrations/20260104000000_add_mgi_to_session_images.sql', 'utf8');
console.log(migrationSQL);

console.log('\n✅ Once applied, the "Images & MGI Scores" tab will show correct counts.');
