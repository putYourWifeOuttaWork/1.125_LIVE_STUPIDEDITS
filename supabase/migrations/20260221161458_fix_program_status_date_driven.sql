/*
  # Date-Driven Program Status and Smart Session Scheduling

  ## Problem
  Program status is set once at creation time and never recalculated.
  Programs that have expired months ago still show as "Active" in the UI,
  and the automatic session scheduler keeps creating sessions for them.

  ## Changes

  1. View: pilot_programs_with_progress
    - Adds `effective_status` computed column: 'scheduled' | 'active' | 'expired'
    - Based on CURRENT_DATE vs start_date/end_date
    - Adds `has_active_devices` boolean for expired-but-still-receiving-data programs

  2. Function: fn_sync_program_statuses()
    - Updates pilot_programs.status column (program_status_enum) to match date-computed values
    - Safe to run repeatedly (idempotent)

  3. One-time fix: Updates all stale programs that show 'active' but have expired

  4. Function: auto_create_daily_sessions() (REPLACED)
    - Now uses date-range checks instead of stale status column
    - Only creates sessions for programs where CURRENT_DATE is within start_date..end_date
    - OR where the program is expired but still has active device assignments (data fidelity)

  5. Security
    - No RLS changes; view retains security_invoker = true
*/

-- ==========================================
-- 1. RECREATE VIEW WITH effective_status
-- ==========================================

DROP VIEW IF EXISTS pilot_programs_with_progress CASCADE;

CREATE VIEW pilot_programs_with_progress
WITH (security_invoker = true)
AS
SELECT
  p.*,

  (p.end_date - p.start_date + 1) AS days_count_this_program,

  CASE
    WHEN CURRENT_DATE < p.start_date THEN 0
    WHEN CURRENT_DATE BETWEEN p.start_date AND p.end_date THEN
      (CURRENT_DATE - p.start_date + 1)
    ELSE (p.end_date - p.start_date + 1)
  END AS day_x_of_program,

  CASE
    WHEN (p.end_date - p.start_date + 1) = 0 THEN 0
    WHEN CURRENT_DATE < p.start_date THEN 0
    WHEN CURRENT_DATE BETWEEN p.start_date AND p.end_date THEN
      ROUND(((CURRENT_DATE - p.start_date + 1)::NUMERIC / (p.end_date - p.start_date + 1)::NUMERIC) * 100, 2)
    ELSE 100
  END AS phase_progress,

  CASE
    WHEN CURRENT_DATE < p.start_date THEN 'scheduled'::TEXT
    WHEN CURRENT_DATE BETWEEN p.start_date AND p.end_date THEN 'active'::TEXT
    ELSE 'expired'::TEXT
  END AS effective_status,

  EXISTS (
    SELECT 1
    FROM sites s2
    JOIN device_site_assignments dsa2 ON dsa2.site_id = s2.site_id
    WHERE s2.program_id = p.program_id
      AND dsa2.is_active = TRUE
  ) AS has_active_devices

FROM
  pilot_programs p;

GRANT SELECT ON pilot_programs_with_progress TO authenticated;

COMMENT ON VIEW pilot_programs_with_progress IS
'Extends pilot_programs with progress metrics and date-driven effective_status. Uses security_invoker=true for RLS.';


-- ==========================================
-- 2. FUNCTION: SYNC STATUSES TO RAW TABLE
-- ==========================================

CREATE OR REPLACE FUNCTION fn_sync_program_statuses()
RETURNS JSONB AS $$
DECLARE
  v_updated_count INT := 0;
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT
      program_id,
      status AS old_status,
      CASE
        WHEN CURRENT_DATE < start_date THEN 'inactive'::program_status_enum
        WHEN CURRENT_DATE BETWEEN start_date AND end_date THEN 'active'::program_status_enum
        ELSE 'inactive'::program_status_enum
      END AS new_status
    FROM pilot_programs
    WHERE status != CASE
        WHEN CURRENT_DATE < start_date THEN 'inactive'::program_status_enum
        WHEN CURRENT_DATE BETWEEN start_date AND end_date THEN 'active'::program_status_enum
        ELSE 'inactive'::program_status_enum
      END
  LOOP
    UPDATE pilot_programs
    SET status = v_rec.new_status, updated_at = NOW()
    WHERE program_id = v_rec.program_id;

    v_updated_count := v_updated_count + 1;

    RAISE NOTICE 'Updated program %: % -> %', v_rec.program_id, v_rec.old_status, v_rec.new_status;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_sync_program_statuses() TO service_role;

COMMENT ON FUNCTION fn_sync_program_statuses() IS
'Syncs pilot_programs.status column to match date-computed values. Safe to run repeatedly.';


-- ==========================================
-- 3. ONE-TIME FIX: Sync all stale statuses now
-- ==========================================

SELECT fn_sync_program_statuses();


-- ==========================================
-- 4. REPLACE auto_create_daily_sessions()
--    with date-based filtering + expired-with-devices support
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

  RAISE NOTICE 'auto_create_daily_sessions: Starting session creation for qualifying sites';

  SELECT fn_sync_program_statuses() INTO v_result;
  RAISE NOTICE 'Status sync result: %', v_result;

  FOR v_site IN
    SELECT DISTINCT s.site_id, s.name, COALESCE(s.timezone, 'UTC') AS timezone,
           p.program_id, p.name AS program_name, p.start_date, p.end_date
    FROM sites s
    JOIN pilot_programs p ON s.program_id = p.program_id
    WHERE
      CURRENT_DATE BETWEEN p.start_date AND p.end_date
      OR (
        CURRENT_DATE > p.end_date
        AND EXISTS (
          SELECT 1 FROM device_site_assignments dsa
          WHERE dsa.site_id = s.site_id AND dsa.is_active = TRUE
        )
      )
    ORDER BY s.site_id
  LOOP
    BEGIN
      RAISE NOTICE 'Processing site: % (%) [program: % %..%]',
        v_site.name, v_site.site_id, v_site.program_name, v_site.start_date, v_site.end_date;

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
        'program_expired', CURRENT_DATE > v_site.end_date,
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

  INSERT INTO session_creation_log (
    execution_time, total_sites, success_count, error_count,
    details, execution_duration_ms
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
'Date-driven session creation. Creates sessions for active programs AND expired programs that still have devices assigned. Syncs status column before each run.';
