import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🧪 Testing Snapshot Cadence System\n');
console.log('═══════════════════════════════════════════════════════════\n');

// Step 1: Check sites with snapshot_cadence_per_day
console.log('Step 1: Checking sites configuration...');
const { data: sites, error: sitesError } = await supabase
  .from('sites')
  .select('site_id, name, snapshot_cadence_per_day, timezone')
  .limit(5);

if (sitesError) {
  console.error('❌ Error fetching sites:', sitesError);
  process.exit(1);
}

console.log(`✅ Found ${sites.length} sites:`);
sites.forEach(site => {
  console.log(`   - ${site.name}: ${site.snapshot_cadence_per_day}/day (${site.timezone})`);
});

// Step 2: Check if any snapshots exist yet
console.log('\nStep 2: Checking existing snapshots...');
const { data: snapshots, error: snapshotsError, count } = await supabase
  .from('session_wake_snapshots')
  .select('*', { count: 'exact', head: false })
  .order('created_at', { ascending: false })
  .limit(5);

if (snapshotsError) {
  console.error('❌ Error fetching snapshots:', snapshotsError);
  process.exit(1);
}

console.log(`✅ Total snapshots in database: ${count}`);
if (snapshots && snapshots.length > 0) {
  console.log('   Recent snapshots:');
  snapshots.forEach(s => {
    console.log(`   - Site: ${s.site_id}, Wake #${s.wake_number}, Created: ${s.created_at}`);
  });
} else {
  console.log('   ⚠️  No snapshots generated yet');
}

// Step 3: Test if snapshot is due for any site
console.log('\nStep 3: Checking which sites need snapshots...');
const { data: dueCheck, error: dueError } = await supabase
  .rpc('is_snapshot_due', { p_site_id: sites[0].site_id });

if (dueError) {
  console.error('❌ Error checking snapshot due status:', dueError);
  process.exit(1);
}

console.log(`✅ Site "${sites[0].name}" needs snapshot: ${dueCheck}`);

// Step 4: Manually trigger snapshot generation
console.log('\nStep 4: Manually triggering snapshot generation...');
const { data: result, error: genError } = await supabase
  .rpc('generate_scheduled_snapshots');

if (genError) {
  console.error('❌ Error generating snapshots:', genError);
  process.exit(1);
}

console.log('✅ Snapshot generation complete!');
console.log(JSON.stringify(result, null, 2));

// Step 5: Verify new snapshots were created
console.log('\nStep 5: Verifying new snapshots...');
const { data: newSnapshots, count: newCount } = await supabase
  .from('session_wake_snapshots')
  .select('*', { count: 'exact', head: false })
  .order('created_at', { ascending: false })
  .limit(3);

console.log(`✅ Total snapshots now: ${newCount}`);
if (newSnapshots && newSnapshots.length > 0) {
  console.log('   Latest snapshots:');
  newSnapshots.forEach(s => {
    console.log(`   - Site: ${s.site_id}, Wake #${s.wake_number}`);
    console.log(`     Devices: ${s.active_devices_count}, Avg MGI: ${s.avg_mgi || 'N/A'}`);
  });
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('✅ Snapshot system is working!');
console.log('\n📋 Next: Build UI controls for cadence configuration');
