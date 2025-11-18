import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Analyzing SITES table structure from sample data...\n');

const { data: sites, error } = await supabase
  .from('sites')
  .select('*')
  .limit(3);

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

console.log(`Found ${sites.length} sites\n`);

const firstSite = sites[0];
console.log('📋 SITES Table Structure:');
console.log('========================\n');

const jsonbColumns = [];
const arrayColumns = [];
const scalarColumns = [];

for (const [key, value] of Object.entries(firstSite)) {
  const type = Array.isArray(value) ? 'array' : typeof value === 'object' && value !== null ? 'jsonb' : 'scalar';
  
  if (type === 'jsonb') {
    jsonbColumns.push(key);
  } else if (type === 'array') {
    arrayColumns.push(key);
  } else {
    scalarColumns.push(key);
  }
}

console.log('📦 JSONB/Complex Columns (for 2D representation):');
console.log('================================================');
jsonbColumns.forEach(col => {
  const value = firstSite[col];
  if (value && Object.keys(value).length > 0) {
    console.log(`\n  ${col}:`);
    console.log(JSON.stringify(value, null, 4));
  }
});

console.log('\n\n📚 Array Columns (lists/multi-value):');
console.log('====================================');
arrayColumns.forEach(col => {
  const value = firstSite[col];
  console.log(`  ${col}: ${Array.isArray(value) ? `[${value.length} items]` : 'null'}`);
  if (value && value.length > 0) {
    console.log(`    First item:`, JSON.stringify(value[0], null, 4));
  }
});

console.log('\n\n🗺️  KEY 2D/Spatial Data Columns:');
console.log('===========================');
const spatialCols = ['wall_details', 'zones', 'airflow_vectors', 'door_details', 'platform_details'];
spatialCols.forEach(col => {
  const value = firstSite[col];
  console.log(`\n  ${col}:`, value ? 'Present ✓' : 'Empty/Null');
  if (value && value.length > 0) {
    console.log(JSON.stringify(value, null, 4));
  }
});

