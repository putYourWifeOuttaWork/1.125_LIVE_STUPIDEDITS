import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== DIAGNOSING METADATA CONTENT ===\n');

// Check what's actually in metadata
const { data: allMeta, error } = await supabase
  .from('device_images')
  .select('image_id, status, metadata, temperature, humidity, captured_at')
  .not('metadata', 'is', null)
  .order('captured_at', { ascending: false })
  .limit(20);

if (error) {
  console.log('Error:', error.message);
} else {
  console.log(`Found ${allMeta.length} rows with metadata\n`);

  let withEnvData = 0;
  let withComputedValues = 0;
  let complete = 0;

  console.log('Analyzing metadata content:\n');

  allMeta.forEach((row, i) => {
    const hasTemp = row.metadata?.temperature !== undefined;
    const hasComputed = row.temperature !== null;
    const isComplete = row.status === 'complete';

    if (hasTemp) withEnvData++;
    if (hasComputed) withComputedValues++;
    if (isComplete) complete++;

    if (i < 5) {
      console.log(`Row ${i + 1}:`);
      console.log(`  status: ${row.status}`);
      console.log(`  metadata.temperature: ${row.metadata?.temperature}`);
      console.log(`  computed temperature: ${row.temperature}`);
      console.log(`  Match: ${hasTemp === hasComputed ? '✅' : '❌'}\n`);
    }
  });

  console.log('Summary:');
  console.log(`  Rows with metadata: ${allMeta.length}`);
  console.log(`  Status = complete: ${complete}`);
  console.log(`  Metadata contains temperature: ${withEnvData}`);
  console.log(`  Computed temperature populated: ${withComputedValues}`);

  if (withEnvData === withComputedValues) {
    console.log('\n✅ COMPUTED COLUMNS ARE WORKING CORRECTLY!');
    console.log('   The "missing" computed values are rows where metadata');
    console.log('   doesn\'t actually contain environmental data.');
  } else {
    console.log('\n⚠️  MISMATCH DETECTED');
    console.log(`   ${withEnvData} rows have temp in metadata`);
    console.log(`   ${withComputedValues} rows have computed temp`);
    console.log(`   Difference: ${Math.abs(withEnvData - withComputedValues)} rows`);
  }

  // Check rows that SHOULD have env data but don't have computed values
  console.log('\n=== Checking for actual missing computed values ===\n');

  const { data: missing } = await supabase
    .from('device_images')
    .select('image_id, status, metadata, temperature')
    .not('metadata', 'is', null)
    .is('temperature', null)
    .limit(10);

  if (missing && missing.length > 0) {
    console.log(`Found ${missing.length} rows with NULL computed values:`);

    let reallyMissing = 0;
    missing.forEach((row, i) => {
      const hasTemp = row.metadata?.temperature !== undefined;
      if (hasTemp) {
        reallyMissing++;
        if (reallyMissing <= 3) {
          console.log(`\n  Row ${i + 1} - ACTUALLY MISSING:`);
          console.log(`    status: ${row.status}`);
          console.log(`    metadata.temperature: ${row.metadata.temperature}`);
          console.log(`    computed temperature: ${row.temperature}`);
        }
      }
    });

    if (reallyMissing === 0) {
      console.log('\n  ✅ None of these rows have temperature in metadata');
      console.log('     Computed columns are working as expected!');
    } else {
      console.log(`\n  ⚠️  ${reallyMissing} rows genuinely missing computed values`);
    }
  }
}

console.log('\n=== DIAGNOSIS COMPLETE ===');
