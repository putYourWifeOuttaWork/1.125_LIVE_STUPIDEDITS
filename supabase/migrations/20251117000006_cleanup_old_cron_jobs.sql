/*
  # Cleanup Old Duplicate Cron Jobs

  1. Purpose
    - Remove duplicate/old cron jobs that are no longer needed
    - Keep only the new "midnight-session-jobs" (from migration 0005)

  2. Jobs Being Removed
    - auto-create-daily-sessions (jobid 1)
    - auto-create-device-sessions-daily (jobid 2)

  3. What Stays
    - midnight-session-jobs (jobid 4) - our new unified job
*/

-- ==========================================
-- Unschedule old duplicate jobs
-- ==========================================

DO $$
BEGIN
  -- Remove old job 1
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-create-daily-sessions') THEN
    PERFORM cron.unschedule('auto-create-daily-sessions');
    RAISE NOTICE '✅ Removed old job: auto-create-daily-sessions';
  END IF;

  -- Remove old job 2
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-create-device-sessions-daily') THEN
    PERFORM cron.unschedule('auto-create-device-sessions-daily');
    RAISE NOTICE '✅ Removed old job: auto-create-device-sessions-daily';
  END IF;

  RAISE NOTICE '🎉 Cleanup complete! Only "midnight-session-jobs" should remain.';
END $$;
