/*
  Setup Automated Daily Session Creation

  This creates a pg_cron job to run auto_create_daily_sessions()
  every day at 12:05 AM UTC.

  IMPORTANT: pg_cron must be enabled in your Supabase project.
  If not enabled, contact Supabase support or enable via dashboard.
*/

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any existing job with the same name (if it exists)
DO $$
BEGIN
  PERFORM cron.unschedule('auto-create-daily-sessions');
EXCEPTION WHEN OTHERS THEN
  -- Job doesn't exist, that's fine
  NULL;
END $$;

-- Schedule the job to run daily at 12:05 AM UTC
SELECT cron.schedule(
  'auto-create-daily-sessions',           -- Job name
  '5 0 * * *',                            -- Cron expression: 12:05 AM UTC daily
  $$ SELECT auto_create_daily_sessions(); $$
);

-- Verify the job was created
SELECT
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job
WHERE jobname = 'auto-create-daily-sessions';

-- Check recent execution logs
SELECT
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (
  SELECT jobid FROM cron.job WHERE jobname = 'auto-create-daily-sessions'
)
ORDER BY start_time DESC
LIMIT 5;

-- Manual test (optional - uncomment to test immediately)
-- SELECT auto_create_daily_sessions();
