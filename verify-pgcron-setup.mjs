import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Verifying pg_cron setup...\n');

// 1. Check scheduled jobs
console.log('📅 Scheduled Cron Jobs:');
console.log('========================');
const { data: jobs, error: jobsError } = await supabase.rpc('get_scheduled_cron_jobs');

if (jobsError) {
  console.error('❌ Error fetching jobs:', jobsError);
} else {
  console.table(jobs);
}

// 2. Test the midnight job function manually
console.log('\n🧪 Testing midnight job function manually:');
console.log('==========================================');
const { data: testResult, error: testError } = await supabase.rpc('run_midnight_session_jobs');

if (testError) {
  console.error('❌ Error:', testError);
} else {
  console.log('✅ Success:', JSON.stringify(testResult, null, 2));
}

// 3. Check job history (if any runs have occurred)
console.log('\n📊 Recent Job History:');
console.log('======================');
const { data: history, error: historyError } = await supabase.rpc('get_cron_job_history', { p_limit: 5 });

if (historyError) {
  console.error('❌ Error fetching history:', historyError);
} else if (history && history.length > 0) {
  console.table(history);
} else {
  console.log('ℹ️  No job runs yet (first run will be at midnight UTC)');
}

console.log('\n✅ Verification complete!');
console.log('\n📌 Next Steps:');
console.log('   - Job will run automatically at midnight UTC (0 0 * * *)');
console.log('   - Check results tomorrow with: SELECT * FROM get_cron_job_history(10);');
console.log('   - View created sessions: SELECT * FROM site_device_sessions WHERE session_date = CURRENT_DATE;');
