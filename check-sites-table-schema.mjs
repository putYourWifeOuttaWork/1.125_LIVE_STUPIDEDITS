import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Inspecting SITES table schema and sample data...\n');

// Get table schema
const { data: columns, error: schemaError } = await supabase
  .rpc('exec_sql', {
    query: `
      SELECT 
        column_name,
        data_type,
        column_default,
        is_nullable,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'sites'
      ORDER BY ordinal_position;
    `
  });

if (schemaError) {
  console.error('❌ Error fetching schema:', schemaError);
} else {
  console.log('📋 SITES Table Columns:');
  console.log('======================');
  console.table(columns);
}

// Get a sample site to see actual data structure
const { data: sampleSite, error: sampleError } = await supabase
  .from('sites')
  .select('*')
  .limit(1)
  .single();

if (sampleError) {
  console.error('❌ Error fetching sample:', sampleError);
} else {
  console.log('\n📦 Sample Site Record:');
  console.log('=====================');
  console.log(JSON.stringify(sampleSite, null, 2));
}

// Check for JSONB columns specifically
const { data: jsonbCols } = await supabase
  .rpc('exec_sql', {
    query: `
      SELECT 
        column_name,
        data_type
      FROM information_schema.columns
      WHERE table_name = 'sites'
        AND data_type IN ('jsonb', 'json')
      ORDER BY column_name;
    `
  });

if (jsonbCols && jsonbCols.length > 0) {
  console.log('\n📊 JSONB Columns in Sites:');
  console.log('=========================');
  console.table(jsonbCols);
}

