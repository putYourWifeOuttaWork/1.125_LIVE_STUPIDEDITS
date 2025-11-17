import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🧹 Cleaning up old cron jobs...\n');

// Query to unschedule old duplicate jobs
const cleanupSQL = `
-- Remove duplicate/old cron jobs
SELECT cron.unschedule('auto-create-daily-sessions');
SELECT cron.unschedule('auto-create-device-sessions-daily');
`;

console.log('SQL to execute:');
console.log(cleanupSQL);
console.log('\n📋 Please run this SQL in Supabase SQL Editor to clean up old jobs.');
console.log('   The new "midnight-session-jobs" (jobid 4) is the correct one to keep.\n');

// Show current jobs
const { data: jobs } = await supabase.rpc('get_scheduled_cron_jobs');
console.log('📅 Current Cron Jobs:');
console.table(jobs);

console.log('\n✅ After cleanup, only "midnight-session-jobs" should remain.');
