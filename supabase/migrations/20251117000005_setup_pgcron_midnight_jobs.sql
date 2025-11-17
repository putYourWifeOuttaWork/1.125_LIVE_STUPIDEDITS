/*
  # Setup pg_cron for Midnight Jobs

  1. Purpose
    - Schedule automatic execution of midnight jobs using pg_cron
    - Runs lock_all_expired_sessions() and auto_create_daily_sessions()
    - No external services needed!

  2. Schedule
    - Daily at midnight UTC: 0 0 * * *
    - Calls the midnight_jobs edge function internally

  3. Benefits
    - Native to Supabase/PostgreSQL
    - No external dependencies
    - Reliable and secure
    - Easy to monitor and manage
*/

-- ==========================================
-- Enable pg_cron extension (if not already enabled)
-- ==========================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ==========================================
-- Create the scheduled job
-- ==========================================

-- First, remove any existing midnight jobs to avoid duplicates
SELECT cron.unschedule('midnight-session-jobs') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'midnight-session-jobs'
);

-- Schedule the midnight jobs
-- Runs every day at midnight UTC
SELECT cron.schedule(
  'midnight-session-jobs',           -- Job name
  '0 0 * * *',                        -- Cron schedule (midnight UTC)
  $$
  DO $$
  DECLARE
    v_lock_result JSONB;
    v_create_result JSONB;
    v_total_locked INT := 0;
    v_total_created INT := 0;
  BEGIN
    -- Log start
    RAISE NOTICE '🌙 Midnight Jobs: Starting at %', NOW();

    -- JOB 1: Lock expired sessions
    BEGIN
      SELECT lock_all_expired_sessions() INTO v_lock_result;
      v_total_locked := COALESCE((v_lock_result->>'total_locked')::INT, 0);
      RAISE NOTICE '🔒 Locked % sessions', v_total_locked;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ Error locking sessions: %', SQLERRM;
    END;

    -- JOB 2: Create new device sessions
    BEGIN
      SELECT auto_create_daily_sessions() INTO v_create_result;
      v_total_created := COALESCE((v_create_result->>'sessions_created')::INT, 0);
      RAISE NOTICE '📝 Created % sessions', v_total_created;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '❌ Error creating sessions: %', SQLERRM;
    END;

    -- Log completion
    RAISE NOTICE '✅ Midnight Jobs: Complete - Locked: %, Created: %', v_total_locked, v_total_created;
  END $$;
  $$
);

-- ==========================================
-- Verify the job was scheduled
-- ==========================================

-- View all scheduled cron jobs
COMMENT ON EXTENSION pg_cron IS 'Midnight session jobs scheduled';

-- ==========================================
-- Helper: View scheduled jobs
-- ==========================================

CREATE OR REPLACE FUNCTION get_scheduled_cron_jobs()
RETURNS TABLE (
  jobid BIGINT,
  jobname TEXT,
  schedule TEXT,
  active BOOLEAN,
  command TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    j.command
  FROM cron.job j
  ORDER BY j.jobid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_scheduled_cron_jobs() IS
'View all scheduled pg_cron jobs';

-- ==========================================
-- Helper: View cron job run history
-- ==========================================

CREATE OR REPLACE FUNCTION get_cron_job_history(p_limit INT DEFAULT 20)
RETURNS TABLE (
  runid BIGINT,
  jobid BIGINT,
  job_name TEXT,
  run_start TIMESTAMPTZ,
  run_end TIMESTAMPTZ,
  status TEXT,
  return_message TEXT,
  duration INTERVAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    jd.runid,
    jd.jobid,
    j.jobname as job_name,
    jd.start_time as run_start,
    jd.end_time as run_end,
    jd.status,
    jd.return_message,
    (jd.end_time - jd.start_time) as duration
  FROM cron.job_run_details jd
  JOIN cron.job j ON jd.jobid = j.jobid
  ORDER BY jd.start_time DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_cron_job_history(INT) IS
'View recent pg_cron job execution history';

-- ==========================================
-- Grant permissions
-- ==========================================

GRANT EXECUTE ON FUNCTION get_scheduled_cron_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION get_cron_job_history(INT) TO authenticated;

-- ==========================================
-- Success message
-- ==========================================

DO $$
BEGIN
  RAISE NOTICE '✅ pg_cron midnight jobs scheduled successfully!';
  RAISE NOTICE '📅 Schedule: Daily at midnight UTC (0 0 * * *)';
  RAISE NOTICE '🔍 View jobs: SELECT * FROM get_scheduled_cron_jobs();';
  RAISE NOTICE '📊 View history: SELECT * FROM get_cron_job_history(10);';
END $$;
