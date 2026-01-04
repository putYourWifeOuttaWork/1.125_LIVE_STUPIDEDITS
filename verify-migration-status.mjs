import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('========================================');
console.log('MIGRATION STATUS VERIFICATION');
console.log('========================================\n');

// Check computed columns
console.log('1. COMPUTED COLUMNS STATUS:\n');

const { data: sample, error: sampleErr } = await supabase
  .from('device_images')
  .select('image_id, captured_at, metadata, temperature, humidity, pressure, gas_resistance, status')
  .not('metadata', 'is', null)
  .order('captured_at', { ascending: false })
  .limit(5);

if (sampleErr) {
  console.log(`   ❌ Error: ${sampleErr.message}`);
  console.log('   Migration NOT applied or incomplete\n');
} else {
  console.log('   ✅ Computed columns exist (temperature, humidity, pressure, gas_resistance)');

  let hasData = 0;
  sample.forEach(img => {
    if (img.temperature !== null) hasData++;
  });

  console.log(`   📊 Sample data: ${hasData}/${sample.length} recent images have computed values\n`);

  // Show why data is missing
  console.log('   Sample metadata vs computed:');
  sample.slice(0, 3).forEach((img, i) => {
    console.log(`   Image ${i + 1}:`);
    console.log(`     status: ${img.status}`);
    console.log(`     metadata.temperature: ${img.metadata?.temperature}`);
    console.log(`     computed temperature: ${img.temperature}`);
  });
}

// Check overall data quality
console.log('\n2. DATA QUALITY ASSESSMENT:\n');

const { count: total } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true });

const { count: withMeta } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true })
  .not('metadata', 'is', null);

const { count: withTemp } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true })
  .not('temperature', 'is', null);

const { count: complete } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'complete');

console.log(`   Total rows: ${total}`);
console.log(`   Status = 'complete': ${complete} (${(complete/total*100).toFixed(1)}%)`);
console.log(`   With metadata JSONB: ${withMeta} (${(withMeta/total*100).toFixed(1)}%)`);
console.log(`   With computed temperature: ${withTemp} (${(withTemp/total*100).toFixed(1)}%)`);

const expectedComputed = Math.min(withMeta, complete);
console.log(`\n   Expected computed values: ~${expectedComputed} (complete rows with metadata)`);
console.log(`   Actual computed values: ${withTemp}`);
console.log(`   Difference: ${expectedComputed - withTemp} rows missing computed values`);

// Diagnose the issue
console.log('\n3. DIAGNOSIS:\n');

if (withTemp === 0) {
  console.log('   ❌ CRITICAL: No computed values at all');
  console.log('   Cause: Migration not applied');
} else if (withTemp < withMeta * 0.5) {
  console.log('   ⚠️  WARNING: Low coverage of computed values');
  console.log('   Cause: Computed columns extract from metadata at INSERT/UPDATE time');
  console.log('   Solution: Existing rows need UPDATE to populate computed columns');
} else {
  console.log('   ✅ Good coverage of computed values');
}

// Check LOCF function
console.log('\n4. LOCF HELPER FUNCTION:\n');

try {
  // Get a real device and session to test with
  const { data: realImg } = await supabase
    .from('device_images')
    .select('device_id, site_device_session_id, captured_at')
    .not('temperature', 'is', null)
    .limit(1)
    .single();

  if (realImg) {
    const { data: locfResult, error: locfErr } = await supabase
      .rpc('get_device_environmental_with_locf', {
        p_device_id: realImg.device_id,
        p_session_id: realImg.site_device_session_id,
        p_captured_at: realImg.captured_at,
        p_wake_payload_id: null
      });

    if (locfErr) {
      console.log(`   ❌ Error: ${locfErr.message}`);
    } else {
      console.log('   ✅ Function exists and works!');
      console.log(`   Result: temp=${locfResult.temperature}, humidity=${locfResult.humidity}`);
    }
  }
} catch (e) {
  console.log(`   ❌ Function error: ${e.message}`);
}

// Check indexes
console.log('\n5. PERFORMANCE INDEXES:\n');

const { data: indexes, error: idxErr } = await supabase
  .rpc('exec_sql', {
    sql: `
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'device_images'
      AND indexname LIKE '%temperature%' OR indexname LIKE '%humidity%'
      OR indexname LIKE '%pressure%' OR indexname LIKE '%metadata%'
      ORDER BY indexname;
    `
  });

if (indexes && indexes.length > 0) {
  console.log('   ✅ Indexes found:');
  indexes.forEach(idx => console.log(`      - ${idx.indexname}`));
} else {
  console.log('   ⚠️  Could not verify indexes (may need direct SQL query)');
}

console.log('\n========================================');
console.log('SUMMARY');
console.log('========================================\n');

const migrationApplied = sampleErr === null;
const dataQuality = withTemp / total;

console.log(`Migration Applied: ${migrationApplied ? '✅ YES' : '❌ NO'}`);
console.log(`Data Quality: ${(dataQuality * 100).toFixed(1)}%`);

if (migrationApplied && dataQuality < 0.5) {
  console.log('\n⚡ ACTION REQUIRED:');
  console.log('   The migration is applied but existing rows need to be updated');
  console.log('   to populate computed columns from metadata.');
  console.log('\n   Run this SQL to backfill:');
  console.log('   UPDATE device_images SET updated_at = updated_at WHERE metadata IS NOT NULL;');
}

console.log('\n========================================\n');
