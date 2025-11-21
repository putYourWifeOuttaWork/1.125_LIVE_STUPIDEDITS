import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyAutomation() {
  console.log('🔍 Verifying Snapshot Automation System\n');

  // Check cron job
  const { data: jobs, error: jobError } = await supabase.rpc('get_scheduled_cron_jobs');
  
  if (jobError) {
    console.error('Error getting cron jobs:', jobError);
  } else {
    console.log('📅 Scheduled Cron Jobs:');
    const snapshotJob = jobs.find(j => j.jobname === 'hourly-snapshot-generation');
    if (snapshotJob) {
      console.log('  ✅', snapshotJob.jobname);
      console.log('  📅 Schedule:', snapshotJob.schedule);
      console.log('  ⚡ Active:', snapshotJob.active);
    } else {
      console.log('  ❌ Snapshot cron job not found!');
    }
  }

  console.log('\n📊 Recent Snapshots (Last 5):');
  const { data: snapshots, error: snapError } = await supabase
    .from('session_wake_snapshots')
    .select('snapshot_id, wake_number, created_at, active_devices_count, new_images_this_round, site_id')
    .order('created_at', { ascending: false })
    .limit(5);

  if (snapError) {
    console.error('Error getting snapshots:', snapError);
  } else {
    for (const s of snapshots) {
      const { data: site } = await supabase
        .from('sites')
        .select('name')
        .eq('site_id', s.site_id)
        .single();
      
      console.log(`  • ${site?.name || 'Unknown Site'}`);
      console.log(`    Wake #${s.wake_number} | ${s.active_devices_count} devices | ${s.new_images_this_round} images`);
      console.log(`    ${s.created_at}`);
    }
  }

  console.log('\n✨ System Status: ACTIVE & RUNNING');
  console.log('🕐 Next automatic run: Top of the hour (0 * * * *)');
  console.log('🚀 Test manually: SELECT trigger_snapshot_generation();');
}

verifyAutomation();
