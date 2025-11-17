/*
  # Fix Auto Session Creation - Remove Invalid Enum Value

  1. Problem
    - auto_create_daily_sessions() function references 'in_progress' in program status filter
    - This value doesn't exist in program_status_enum
    - Error: invalid input value for enum program_status_enum: "in_progress"

  2. Solution
    - Update function to only check for 'active' status
    - Pilot programs only have 'active', 'completed', 'draft', etc.
    - Remove 'in_progress' reference from all session creation functions

  3. Impact
    - Function will now only create sessions for truly active programs
    - More accurate than including non-existent status value
*/

-- ==========================================
-- FIX: AUTO CREATE DAILY SESSIONS
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

  -- Loop through all active sites (FIXED: removed 'in_progress')
  FOR v_site IN
    SELECT DISTINCT
      s.site_id,
      s.name,
      COALESCE(s.timezone, 'UTC') as timezone,
      s.program_id
    FROM sites s
    JOIN pilot_programs p ON s.program_id = p.program_id
    WHERE p.status = 'active'  -- FIXED: Only check for 'active'
      AND s.site_id IS NOT NULL
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

COMMENT ON FUNCTION auto_create_daily_sessions() IS
'Create daily sessions for all sites with active programs. Fixed to use only valid status values.';

-- ==========================================
-- FIX: TIMEZONE-AWARE SESSION CREATION
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

  -- Find sites where it's midnight in their local timezone (FIXED: removed 'in_progress')
  FOR v_site IN
    SELECT DISTINCT
      s.site_id,
      s.name,
      COALESCE(s.timezone, 'UTC') as timezone,
      EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(s.timezone, 'UTC'))::INT as local_hour
    FROM sites s
    JOIN pilot_programs p ON s.program_id = p.program_id
    WHERE p.status = 'active'  -- FIXED: Only check for 'active'
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

COMMENT ON FUNCTION auto_create_daily_sessions_timezone_aware() IS
'Create sessions only for sites where it is currently midnight in their local timezone. Fixed to use only valid status values.';
