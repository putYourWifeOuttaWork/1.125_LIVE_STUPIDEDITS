/*
  # Automatic Session Creation Scheduler

  1. Purpose
    - Automate daily session creation for all active sites
    - Set up pg_cron job to run at midnight
    - Provide wrapper function to process all sites
    - Enable monitoring and error tracking

  2. Functions
    - auto_create_daily_sessions() - Process all sites
    - auto_create_daily_sessions_timezone_aware() - Future: per-timezone scheduling

  3. Scheduling
    - pg_cron job runs daily at midnight UTC
    - Can be adjusted for timezone-aware scheduling
    - Logs all executions for monitoring

  4. Monitoring
    - session_creation_log table tracks all runs
    - Success/failure counts per execution
    - Detailed error information

  5. Security
    - SECURITY DEFINER for system-level access
    - Service role execution
*/

-- ==========================================
-- TABLE: SESSION_CREATION_LOG
-- ==========================================

CREATE TABLE IF NOT EXISTS session_creation_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Execution details
  execution_time TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  total_sites INT DEFAULT 0,
  success_count INT DEFAULT 0,
  error_count INT DEFAULT 0,

  -- Detailed results
  details JSONB,

  -- Timing
  execution_duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_session_creation_log_execution ON session_creation_log(execution_time DESC);
CREATE INDEX IF NOT EXISTS idx_session_creation_log_errors ON session_creation_log(error_count) WHERE error_count > 0;

-- RLS (super_admin only)
ALTER TABLE session_creation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view session creation logs"
  ON session_creation_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.is_super_admin = true
    )
  );

-- Service role can insert logs (for automated runs)
CREATE POLICY "Service role can insert session creation logs"
  ON session_creation_log FOR INSERT TO service_role
  WITH CHECK (true);

COMMENT ON TABLE session_creation_log IS 'Audit log for automatic session creation runs. Tracks successes, failures, and execution time.';

-- ==========================================
-- FUNCTION: AUTO CREATE DAILY SESSIONS (ALL SITES)
-- ==========================================

CREATE OR REPLACE FUNCTION auto_create_daily_sessions()
RETURNS JSONB AS $$
DECLARE
  v_site RECORD;
  v_result JSONB;
  v_results JSONB[] := ARRAY[]::JSONB[];
  v_success_count INT := 0;
  v_error_count INT := 0;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_log_id UUID;
BEGIN
  v_start_time := clock_timestamp();

  RAISE NOTICE 'auto_create_daily_sessions: Starting session creation for all sites';

  -- Loop through all active sites
  FOR v_site IN
    SELECT DISTINCT s.site_id, s.name, COALESCE(s.timezone, 'UTC') as timezone
    FROM sites s
    JOIN pilot_programs p ON s.program_id = p.program_id
    WHERE p.status IN ('active', 'in_progress')
    ORDER BY s.site_id
  LOOP
    BEGIN
      RAISE NOTICE 'Processing site: % (%)', v_site.name, v_site.site_id;

      -- Call midnight opener for this site
      v_result := fn_midnight_session_opener(v_site.site_id);

      IF (v_result->>'success')::boolean THEN
        v_success_count := v_success_count + 1;
        RAISE NOTICE 'Site % succeeded', v_site.name;
      ELSE
        v_error_count := v_error_count + 1;
        RAISE WARNING 'Site % failed: %', v_site.name, v_result->>'message';
      END IF;

      v_results := array_append(v_results, jsonb_build_object(
        'site_id', v_site.site_id,
        'site_name', v_site.name,
        'timezone', v_site.timezone,
        'result', v_result
      ));

    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Site % exception: %', v_site.name, SQLERRM;

      v_results := array_append(v_results, jsonb_build_object(
        'site_id', v_site.site_id,
        'site_name', v_site.name,
        'error', SQLERRM,
        'sqlstate', SQLSTATE
      ));
    END;
  END LOOP;

  v_end_time := clock_timestamp();

  -- Insert log record
  INSERT INTO session_creation_log (
    execution_time,
    total_sites,
    success_count,
    error_count,
    details,
    execution_duration_ms
  )
  VALUES (
    v_start_time,
    v_success_count + v_error_count,
    v_success_count,
    v_error_count,
    to_jsonb(v_results),
    EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INT
  )
  RETURNING log_id INTO v_log_id;

  RAISE NOTICE 'auto_create_daily_sessions: Complete. Success: %, Errors: %, Duration: %ms',
    v_success_count, v_error_count, EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INT;

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'total_sites', v_success_count + v_error_count,
    'success_count', v_success_count,
    'error_count', v_error_count,
    'execution_duration_ms', EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INT,
    'details', to_jsonb(v_results)
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'auto_create_daily_sessions: Fatal error: %', SQLERRM;

  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE,
    'success_count', v_success_count,
    'error_count', v_error_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION auto_create_daily_sessions() TO service_role;

COMMENT ON FUNCTION auto_create_daily_sessions() IS
'Create daily sessions for all active sites. Called by pg_cron or edge function. Returns summary with success/error counts.';

-- ==========================================
-- FUNCTION: TIMEZONE-AWARE SESSION CREATION
-- ==========================================

CREATE OR REPLACE FUNCTION auto_create_daily_sessions_timezone_aware()
RETURNS JSONB AS $$
DECLARE
  v_site RECORD;
  v_result JSONB;
  v_results JSONB[] := ARRAY[]::JSONB[];
  v_success_count INT := 0;
  v_error_count INT := 0;
  v_current_hour INT;
BEGIN
  -- Get current UTC hour
  v_current_hour := EXTRACT(HOUR FROM NOW());

  RAISE NOTICE 'auto_create_daily_sessions_timezone_aware: Current UTC hour: %', v_current_hour;

  -- Find sites where it's midnight in their local timezone
  FOR v_site IN
    SELECT DISTINCT
      s.site_id,
      s.name,
      COALESCE(s.timezone, 'UTC') as timezone,
      EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(s.timezone, 'UTC'))::INT as local_hour
    FROM sites s
    JOIN pilot_programs p ON s.program_id = p.program_id
    WHERE p.status IN ('active', 'in_progress')
    HAVING EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(s.timezone, 'UTC'))::INT = 0
  LOOP
    BEGIN
      RAISE NOTICE 'Midnight detected for site: % (%) in timezone %', v_site.name, v_site.site_id, v_site.timezone;

      -- Check if session already created today
      IF EXISTS (
        SELECT 1 FROM site_device_sessions
        WHERE site_id = v_site.site_id
          AND session_date = CURRENT_DATE
      ) THEN
        RAISE NOTICE 'Session already exists for site % today, skipping', v_site.name;
        CONTINUE;
      END IF;

      -- Call midnight opener
      v_result := fn_midnight_session_opener(v_site.site_id);

      IF (v_result->>'success')::boolean THEN
        v_success_count := v_success_count + 1;
      ELSE
        v_error_count := v_error_count + 1;
      END IF;

      v_results := array_append(v_results, jsonb_build_object(
        'site_id', v_site.site_id,
        'site_name', v_site.name,
        'timezone', v_site.timezone,
        'result', v_result
      ));

    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      v_results := array_append(v_results, jsonb_build_object(
        'site_id', v_site.site_id,
        'site_name', v_site.name,
        'error', SQLERRM
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'total_sites', v_success_count + v_error_count,
    'success_count', v_success_count,
    'error_count', v_error_count,
    'details', to_jsonb(v_results)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION auto_create_daily_sessions_timezone_aware() TO service_role;

COMMENT ON FUNCTION auto_create_daily_sessions_timezone_aware() IS
'Create sessions only for sites where it is currently midnight in their local timezone. Run hourly to catch all timezones.';

-- ==========================================
-- PG_CRON SETUP (OPTIONAL)
-- ==========================================

-- NOTE: pg_cron may not be available in all Supabase instances
-- If pg_cron is not available, use the edge function approach:
-- 1. Edge function already exists: supabase/functions/auto_create_daily_sessions.ts
-- 2. Schedule it via external cron service (cron-job.org, Vercel Cron, etc.)
-- 3. Or use Supabase Edge Functions native scheduling

-- If pg_cron IS available, uncomment these lines:
/*
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'auto-create-device-sessions-daily',
  '0 0 * * *',
  $$ SELECT auto_create_daily_sessions(); $$
);
*/

-- ==========================================
-- MANUAL TESTING
-- ==========================================

-- To test session creation manually, run:
-- SELECT auto_create_daily_sessions();

-- To test timezone-aware version:
-- SELECT auto_create_daily_sessions_timezone_aware();

COMMENT ON FUNCTION auto_create_daily_sessions() IS
'Create daily sessions for all active sites. Can be called manually or scheduled via:
1. pg_cron (if available in your Supabase instance)
2. Edge function: supabase/functions/auto_create_daily_sessions.ts
3. External cron service calling the edge function
Run manually for testing: SELECT auto_create_daily_sessions();';
