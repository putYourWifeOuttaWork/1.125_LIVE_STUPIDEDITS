/*
  # Fix Auto Session Creation - Only Create for Sites with Active Mapped Devices

  1. Changes
    - Update auto_create_daily_sessions() to only process sites that have active mapped devices
    - Add device check before creating sessions
    - Update logging to track skipped sites

  2. Logic
    - Site must have status = 'active' or 'in_progress'
    - Site must have at least one device with:
      * provisioning_status = 'active'
      * is_active = true
    - Skip sites without mapped devices
*/

-- ==========================================
-- UPDATE: AUTO CREATE DAILY SESSIONS FUNCTION
-- ==========================================

CREATE OR REPLACE FUNCTION auto_create_daily_sessions()
RETURNS JSONB AS $$
DECLARE
  v_site RECORD;
  v_result JSONB;
  v_results JSONB[] := ARRAY[]::JSONB[];
  v_success_count INT := 0;
  v_error_count INT := 0;
  v_skipped_count INT := 0;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_log_id UUID;
  v_device_count INT;
BEGIN
  v_start_time := clock_timestamp();

  RAISE NOTICE 'auto_create_daily_sessions: Starting session creation for all sites';

  -- Loop through all active sites that have active mapped devices
  FOR v_site IN
    SELECT DISTINCT
      s.site_id,
      s.name,
      COALESCE(s.timezone, 'UTC') as timezone,
      s.program_id
    FROM sites s
    JOIN pilot_programs p ON s.program_id = p.program_id
    WHERE p.status IN ('active', 'in_progress')
      AND s.site_id IS NOT NULL
    ORDER BY s.site_id
  LOOP
    BEGIN
      -- Check if site has any active mapped devices
      SELECT COUNT(*)
      INTO v_device_count
      FROM devices d
      WHERE d.site_id = v_site.site_id
        AND d.provisioning_status = 'active'
        AND d.is_active = true;

      IF v_device_count = 0 THEN
        -- Skip this site - no active mapped devices
        v_skipped_count := v_skipped_count + 1;
        RAISE NOTICE 'Skipping site % (%) - no active mapped devices', v_site.name, v_site.site_id;

        v_results := array_append(v_results, jsonb_build_object(
          'site_id', v_site.site_id,
          'site_name', v_site.name,
          'timezone', v_site.timezone,
          'skipped', true,
          'reason', 'No active mapped devices'
        ));

        CONTINUE;
      END IF;

      RAISE NOTICE 'Processing site: % (%) - % active device(s)', v_site.name, v_site.site_id, v_device_count;

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
        'device_count', v_device_count,
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
  INSERT INTO auto_session_creation_log (
    execution_time,
    total_sites,
    success_count,
    error_count,
    details,
    execution_duration_ms
  )
  VALUES (
    v_start_time,
    v_success_count + v_error_count + v_skipped_count,
    v_success_count,
    v_error_count,
    jsonb_build_object(
      'sites_processed', v_results,
      'summary', jsonb_build_object(
        'total', v_success_count + v_error_count + v_skipped_count,
        'success', v_success_count,
        'errors', v_error_count,
        'skipped', v_skipped_count,
        'reason_skipped', 'No active mapped devices'
      )
    ),
    EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000
  )
  RETURNING log_id INTO v_log_id;

  RAISE NOTICE 'auto_create_daily_sessions: Complete. Success: %, Errors: %, Skipped: %, Duration: %ms',
    v_success_count, v_error_count, v_skipped_count,
    EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'summary', jsonb_build_object(
      'total_sites', v_success_count + v_error_count + v_skipped_count,
      'success_count', v_success_count,
      'error_count', v_error_count,
      'skipped_count', v_skipped_count,
      'skipped_reason', 'No active mapped devices'
    ),
    'execution_time_ms', EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000,
    'details', v_results
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_create_daily_sessions IS 'Automatically creates daily sessions for all active sites that have active mapped devices. Skips sites without devices.';
