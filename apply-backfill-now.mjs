import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('========================================');
console.log('APPLYING DEVICE_IMAGES BACKFILL');
console.log('========================================\n');

// Step 1: Check current state
console.log('1. BEFORE BACKFILL:\n');

const { count: totalBefore } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true });

const { count: withMetaBefore } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true })
  .not('metadata', 'is', null);

const { count: withTempBefore } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true })
  .not('temperature', 'is', null);

const { count: needsBackfill } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true })
  .not('metadata', 'is', null)
  .is('temperature', null);

console.log(`   Total rows: ${totalBefore}`);
console.log(`   With metadata: ${withMetaBefore}`);
console.log(`   With computed temperature: ${withTempBefore} (${(withTempBefore/totalBefore*100).toFixed(1)}%)`);
console.log(`   Needs backfill: ${needsBackfill}\n`);

// Step 2: Apply backfill
console.log('2. APPLYING BACKFILL:\n');
console.log('   Running UPDATE to trigger computed column generation...');

const startTime = Date.now();

const { data: updateResult, error: updateError } = await supabase
  .rpc('exec_raw_sql', {
    query: `
      UPDATE device_images
      SET updated_at = NOW()
      WHERE metadata IS NOT NULL
        AND temperature IS NULL;
    `
  });

// If exec_raw_sql doesn't exist, try direct update
if (updateError) {
  console.log('   Using direct update approach...');

  // Get all IDs that need backfill
  const { data: toUpdate } = await supabase
    .from('device_images')
    .select('image_id')
    .not('metadata', 'is', null)
    .is('temperature', null);

  if (toUpdate && toUpdate.length > 0) {
    console.log(`   Updating ${toUpdate.length} rows...`);

    // Update in batches
    const batchSize = 50;
    let updated = 0;

    for (let i = 0; i < toUpdate.length; i += batchSize) {
      const batch = toUpdate.slice(i, i + batchSize);
      const ids = batch.map(r => r.image_id);

      const { error: batchError } = await supabase
        .from('device_images')
        .update({ updated_at: new Date().toISOString() })
        .in('image_id', ids);

      if (batchError) {
        console.log(`   ⚠️  Error in batch ${i}-${i+batchSize}:`, batchError.message);
      } else {
        updated += batch.length;
        process.stdout.write(`\r   Progress: ${updated}/${toUpdate.length} rows...`);
      }
    }
    console.log('\n   ✅ Backfill complete!');
  }
} else {
  console.log('   ✅ Backfill SQL executed!');
}

const duration = ((Date.now() - startTime) / 1000).toFixed(2);
console.log(`   Duration: ${duration}s\n`);

// Step 3: Verify results
console.log('3. AFTER BACKFILL:\n');

// Wait a moment for database to process
await new Promise(resolve => setTimeout(resolve, 1000));

const { count: totalAfter } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true });

const { count: withMetaAfter } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true })
  .not('metadata', 'is', null);

const { count: withTempAfter } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true })
  .not('temperature', 'is', null);

const { count: stillMissing } = await supabase
  .from('device_images')
  .select('*', { count: 'exact', head: true })
  .not('metadata', 'is', null)
  .is('temperature', null);

console.log(`   Total rows: ${totalAfter}`);
console.log(`   With metadata: ${withMetaAfter}`);
console.log(`   With computed temperature: ${withTempAfter} (${(withTempAfter/totalAfter*100).toFixed(1)}%)`);
console.log(`   Still missing: ${stillMissing}\n`);

// Step 4: Show improvement
console.log('4. IMPROVEMENT:\n');
const improvement = withTempAfter - withTempBefore;
const improvementPercent = ((withTempAfter / totalAfter) - (withTempBefore / totalBefore)) * 100;

console.log(`   Rows updated: ${improvement}`);
console.log(`   Quality improvement: +${improvementPercent.toFixed(1)}%`);
console.log(`   Coverage: ${withTempBefore}/${totalBefore} → ${withTempAfter}/${totalAfter}\n`);

// Step 5: Sample check
console.log('5. SAMPLE DATA VERIFICATION:\n');

const { data: samples } = await supabase
  .from('device_images')
  .select('image_id, captured_at, metadata, temperature, humidity, pressure, status')
  .not('metadata', 'is', null)
  .order('captured_at', { ascending: false })
  .limit(3);

if (samples && samples.length > 0) {
  samples.forEach((img, i) => {
    console.log(`   Sample ${i + 1}:`);
    console.log(`     captured_at: ${img.captured_at}`);
    console.log(`     status: ${img.status}`);
    console.log(`     metadata.temperature: ${img.metadata?.temperature}`);
    console.log(`     computed temperature: ${img.temperature} ${img.temperature !== null ? '✅' : '❌'}`);
    console.log(`     computed humidity: ${img.humidity} ${img.humidity !== null ? '✅' : '❌'}\n`);
  });
}

// Final verdict
console.log('========================================');
console.log('SUMMARY');
console.log('========================================\n');

const finalQuality = (withTempAfter / totalAfter) * 100;

if (finalQuality > 90) {
  console.log('✅ EXCELLENT: Backfill complete! Data quality: ' + finalQuality.toFixed(1) + '%');
} else if (finalQuality > 40) {
  console.log('✅ SUCCESS: Backfill complete! Data quality: ' + finalQuality.toFixed(1) + '%');
} else {
  console.log('⚠️  WARNING: Data quality is ' + finalQuality.toFixed(1) + '%');
  console.log('   Some rows with metadata still missing computed values.');
}

console.log('\n========================================\n');
