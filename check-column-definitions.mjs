import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== CHECKING COLUMN DEFINITIONS ===\n');

// Try to query column definitions using pg_catalog
const { data: result, error } = await supabase
  .rpc('exec_raw_sql', {
    query: `
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        is_generated,
        generation_expression
      FROM information_schema.columns
      WHERE table_name = 'device_images'
      AND column_name IN ('temperature', 'humidity', 'pressure', 'gas_resistance', 'metadata')
      ORDER BY ordinal_position;
    `
  });

if (error) {
  console.log('Cannot query via RPC, checking differently...\n');

  // Check if columns exist by trying to select them
  const { data: sample, error: sampleErr } = await supabase
    .from('device_images')
    .select('image_id, temperature, humidity, pressure, gas_resistance, metadata')
    .limit(1);

  if (sampleErr) {
    console.log('❌ Error:', sampleErr.message);
    console.log('\nColumns may not exist or have wrong names.');
  } else {
    console.log('✅ Columns are accessible via queries');
    console.log('Column names found:', Object.keys(sample[0] || {}));

    // Check a specific row with metadata
    const { data: withMeta } = await supabase
      .from('device_images')
      .select('image_id, captured_at, metadata, temperature, humidity, status')
      .not('metadata', 'is', null)
      .is('temperature', null)
      .limit(1);

    if (withMeta && withMeta.length > 0) {
      console.log('\nExample row with metadata but no computed value:');
      console.log('  image_id:', withMeta[0].image_id);
      console.log('  status:', withMeta[0].status);
      console.log('  metadata.temperature:', withMeta[0].metadata?.temperature);
      console.log('  computed temperature:', withMeta[0].temperature);
      console.log('\nThis confirms: Metadata exists but computed column is NULL');
      console.log('Issue: GENERATED STORED columns not working or not applied');
    }
  }
} else {
  console.log('Column definitions:');
  console.log(result);
}

// Try to manually compute one value to test the expression
console.log('\n=== TESTING MANUAL COMPUTATION ===\n');

const { data: testRow } = await supabase
  .from('device_images')
  .select('image_id, metadata')
  .not('metadata', 'is', null)
  .is('temperature', null)
  .limit(1)
  .single();

if (testRow && testRow.metadata) {
  console.log('Testing with row:', testRow.image_id);
  console.log('Metadata:', testRow.metadata);
  console.log('Metadata temperature value:', testRow.metadata.temperature);
  console.log('Type:', typeof testRow.metadata.temperature);

  // Try to manually extract and convert
  const tempValue = testRow.metadata.temperature;
  const tempAsNumber = typeof tempValue === 'string' ? parseFloat(tempValue) : tempValue;
  console.log('\nManual extraction would give:', tempAsNumber);
  console.log('SQL expression should be: (metadata->>\'temperature\')::numeric');
}

console.log('\n=== CHECK COMPLETE ===');
