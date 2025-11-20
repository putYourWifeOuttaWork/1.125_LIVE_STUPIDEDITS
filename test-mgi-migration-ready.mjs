import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking if MGI migration is ready to apply...\n');

// Check if migration already applied
const { data: columns, error } = await supabase
  .from('device_images')
  .select('*')
  .limit(1);

if (error) {
  console.error('❌ Error checking schema:', error.message);
  process.exit(1);
}

const columnNames = columns && columns.length > 0 ? Object.keys(columns[0]) : [];

console.log('Current device_images columns:', columnNames.length);

const mgiColumns = ['mgi_score', 'mgi_velocity', 'mgi_speed', 'scored_at', 'roboflow_response', 'wake_payload_id'];
const missingColumns = mgiColumns.filter(col => !columnNames.includes(col));

if (missingColumns.length === 0) {
  console.log('✅ MGI columns already exist!');
  console.log('\nExisting MGI columns:');
  mgiColumns.forEach(col => console.log(`  ✓ ${col}`));
} else {
  console.log('⚠️  MGI migration needs to be applied');
  console.log('\nMissing columns:');
  missingColumns.forEach(col => console.log(`  ✗ ${col}`));
  
  console.log('\n📁 Migration file ready at:');
  console.log('   supabase/migrations/20251120000000_auto_calculate_mgi_velocity.sql');
  console.log('\n🚀 Apply the migration using:');
  console.log('   1. Supabase Dashboard → SQL Editor');
  console.log('   2. Copy/paste the migration file content');
  console.log('   3. Run the SQL');
}

console.log('\n📊 Migration Summary:');
console.log('  • Add MGI scoring columns to device_images');
console.log('  • Add velocity/speed tracking to devices');  
console.log('  • Create site_snapshots table');
console.log('  • Create automated calculation triggers');
console.log('  • Create snapshot generation functions');
