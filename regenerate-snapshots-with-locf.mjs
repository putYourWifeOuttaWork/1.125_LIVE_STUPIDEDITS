import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔄 Regenerating snapshots with LOCF logic...\n');

// Get the ACTIVE or most recent session for "Iot Test Site 2"
const { data: session, error: sessionError } = await supabase
  .from('site_device_sessions')
  .select('session_id, site_id, status, sites(name)')
  .eq('sites.name', 'Iot Test Site 2')
  .in('status', ['active', 'in_progress'])
  .order('session_start_time', { ascending: false })
  .limit(1)
  .single();

if (sessionError || !session) {
  console.error('❌ Could not find session for "Iot Test Site 2"');
  console.error(sessionError);
  process.exit(1);
}

console.log(`✅ Found session: ${session.session_id}`);
console.log(`   Status: ${session.status}\n`);

// Get existing snapshots to regenerate
const { data: snapshots, error: snapshotsError } = await supabase
  .from('session_wake_snapshots')
  .select('snapshot_id, wake_number, wake_round_start, wake_round_end')
  .eq('session_id', session.session_id)
  .order('wake_number', { ascending: true });

if (snapshotsError) {
  console.error('❌ Error fetching snapshots:', snapshotsError);
  process.exit(1);
}

console.log(`📸 Found ${snapshots.length} snapshots to regenerate\n`);

// Regenerate each snapshot
let successCount = 0;
let errorCount = 0;

for (const snapshot of snapshots) {
  process.stdout.write(`   Wake #${snapshot.wake_number}... `);

  const { data, error } = await supabase.rpc('generate_session_wake_snapshot', {
    p_session_id: session.session_id,
    p_wake_number: snapshot.wake_number,
    p_wake_round_start: snapshot.wake_round_start,
    p_wake_round_end: snapshot.wake_round_end
  });

  if (error) {
    console.log(`❌ FAILED`);
    console.error(`      Error: ${error.message}`);
    errorCount++;
  } else {
    console.log(`✅ Done`);
    successCount++;
  }
}

console.log(`\n📊 Results:`);
console.log(`   ✅ Success: ${successCount}`);
console.log(`   ❌ Errors: ${errorCount}`);
console.log(`\n🎉 Snapshots regenerated with LOCF!`);
console.log(`   Devices will now carry forward their last known state`);
console.log(`   Refresh the browser to see the changes`);
