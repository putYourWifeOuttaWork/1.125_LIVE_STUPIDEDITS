/*
  # Fix Auto Session Creation - Complete Fix for All Issues

  ## Problems Identified:
  1. **Enum Error**: `odor_distance_enum` doesn't have 'None' value
  2. **Enum Error**: `airflow_enum` doesn't have 'Moderate' value
  3. **Check Constraint**: submissions_creator_check requires either created_by OR created_by_device_id

  ## Solutions:
  1. Add missing enum values to airflow_enum and odor_distance_enum
  2. Update fn_get_or_create_device_submission to use valid enum values as fallbacks
  3. Update fn_get_or_create_device_submission to set created_by_device_id to a system marker

  ## Testing:
  After applying this migration, run:
  SELECT auto_create_daily_sessions();
*/

-- ==========================================
-- 1. Add Missing Enum Values
-- ==========================================

-- Add 'None' to odor_distance_enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'None'
    AND enumtypid = 'odor_distance_enum'::regtype
  ) THEN
    ALTER TYPE odor_distance_enum ADD VALUE 'None';
    RAISE NOTICE 'Added ''None'' to odor_distance_enum';
  ELSE
    RAISE NOTICE '''None'' already exists in odor_distance_enum';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add ''None'' to odor_distance_enum: %', SQLERRM;
END $$;

-- Add 'Moderate' to airflow_enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'Moderate'
    AND enumtypid = 'airflow_enum'::regtype
  ) THEN
    ALTER TYPE airflow_enum ADD VALUE 'Moderate';
    RAISE NOTICE 'Added ''Moderate'' to airflow_enum';
  ELSE
    RAISE NOTICE '''Moderate'' already exists in airflow_enum';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add ''Moderate'' to airflow_enum: %', SQLERRM;
END $$;

-- ==========================================
-- 2. Create System Device for Auto-Generated Submissions
-- ==========================================

-- Create a special "SYSTEM" device to satisfy the creator constraint
DO $$
DECLARE
  v_system_device_id UUID;
BEGIN
  -- Check if SYSTEM device already exists
  SELECT device_id INTO v_system_device_id
  FROM devices
  WHERE device_mac = 'SYSTEM:AUTO:GENERATED';

  IF v_system_device_id IS NULL THEN
    -- Create the SYSTEM device (columns match actual devices table schema)
    INSERT INTO devices (
      device_mac,
      device_name,
      is_active,
      provisioning_status,
      firmware_version,
      hardware_version,
      notes
    ) VALUES (
      'SYSTEM:AUTO:GENERATED',
      'System Auto-Generated Submissions',
      false, -- Not a real device
      'mapped', -- System device is always "mapped"
      '1.0.0',
      'SYSTEM',
      'Virtual device used as creator for system-generated device submission shells. Not a physical device.'
    );

    RAISE NOTICE 'Created SYSTEM device for auto-generated submissions';
  ELSE
    RAISE NOTICE 'SYSTEM device already exists: %', v_system_device_id;
  END IF;
END $$;

-- ==========================================
-- 3. Update fn_get_or_create_device_submission
-- ==========================================

CREATE OR REPLACE FUNCTION fn_get_or_create_device_submission(
  p_site_id UUID,
  p_session_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_submission_id UUID;
  v_program_id UUID;
  v_company_id UUID;
  v_temperature NUMERIC;
  v_humidity NUMERIC;
  v_airflow TEXT;
  v_odor_distance TEXT;
  v_weather TEXT;
  v_submission_timezone TEXT;
  v_global_submission_id BIGINT;
  v_submission_defaults JSONB;
  v_system_device_id UUID;
BEGIN
  -- ========================================
  -- Step 1: Check for existing device submission for this site/date
  -- ========================================
  SELECT submission_id INTO v_submission_id
  FROM submissions
  WHERE site_id = p_site_id
    AND DATE(created_at AT TIME ZONE COALESCE(
      (SELECT timezone FROM sites WHERE site_id = p_site_id),
      'UTC'
    )) = p_session_date
    AND is_device_generated = TRUE
  LIMIT 1;

  -- If exists, return early
  IF v_submission_id IS NOT NULL THEN
    RETURN v_submission_id;
  END IF;

  -- ========================================
  -- Step 2: Get SYSTEM device ID
  -- ========================================
  SELECT device_id INTO v_system_device_id
  FROM devices
  WHERE device_mac = 'SYSTEM:AUTO:GENERATED';

  IF v_system_device_id IS NULL THEN
    RAISE EXCEPTION 'SYSTEM device not found - please run migration to create it';
  END IF;

  -- ========================================
  -- Step 3: Fetch site lineage and defaults
  -- ========================================
  SELECT
    s.program_id,
    p.company_id,
    s.timezone,
    s.submission_defaults,
    s.default_indoor_temperature,
    s.default_temperature,
    s.default_indoor_humidity,
    s.default_humidity,
    s.default_weather
  INTO
    v_program_id,
    v_company_id,
    v_submission_timezone,
    v_submission_defaults,
    v_temperature, -- will use as fallback
    v_temperature, -- overwrite if indoor exists
    v_humidity,
    v_humidity,
    v_weather
  FROM sites s
  JOIN pilot_programs p ON s.program_id = p.program_id
  WHERE s.site_id = p_site_id;

  IF v_program_id IS NULL THEN
    RAISE EXCEPTION 'Site % not found or has no program assignment', p_site_id;
  END IF;

  -- ========================================
  -- Step 4: Determine temperature with fallback chain
  -- ========================================
  -- Try to get latest device telemetry for this site/date
  SELECT AVG(temperature) INTO v_temperature
  FROM device_wake_payloads dwp
  WHERE dwp.site_id = p_site_id
    AND DATE(dwp.captured_at AT TIME ZONE COALESCE(v_submission_timezone, 'UTC')) = p_session_date
    AND dwp.temperature IS NOT NULL;

  -- Fallback chain: device telemetry → site defaults → hardcoded
  IF v_temperature IS NULL THEN
    SELECT COALESCE(default_indoor_temperature, default_temperature, 70)
    INTO v_temperature
    FROM sites WHERE site_id = p_site_id;
  END IF;

  -- ========================================
  -- Step 5: Determine humidity with fallback chain
  -- ========================================
  SELECT AVG(humidity) INTO v_humidity
  FROM device_wake_payloads dwp
  WHERE dwp.site_id = p_site_id
    AND DATE(dwp.captured_at AT TIME ZONE COALESCE(v_submission_timezone, 'UTC')) = p_session_date
    AND dwp.humidity IS NOT NULL;

  IF v_humidity IS NULL THEN
    SELECT COALESCE(default_indoor_humidity, default_humidity, 45)
    INTO v_humidity
    FROM sites WHERE site_id = p_site_id;
  END IF;

  -- ========================================
  -- Step 6: Parse enum values with SAFE defaults
  -- ========================================
  IF v_submission_defaults IS NOT NULL THEN
    v_airflow := COALESCE(v_submission_defaults->>'airflow', 'Moderate');
    v_odor_distance := COALESCE(v_submission_defaults->>'odor_distance', 'None');
    IF v_weather IS NULL THEN
      v_weather := COALESCE(v_submission_defaults->>'weather', 'Clear');
    END IF;
  ELSE
    -- Safe platform defaults that should exist in all enums
    v_airflow := 'Moderate'; -- Now added to enum
    v_odor_distance := 'None'; -- Now added to enum
    v_weather := COALESCE(v_weather::TEXT, 'Clear');
  END IF;

  -- ========================================
  -- Step 7: Handle timezone with fallback
  -- ========================================
  v_submission_timezone := COALESCE(v_submission_timezone, 'UTC');

  -- ========================================
  -- Step 8: Generate global_submission_id
  -- ========================================
  v_global_submission_id := nextval('global_submission_id_seq');

  -- ========================================
  -- Step 9: Create device submission shell
  -- ========================================
  INSERT INTO submissions (
    site_id,
    program_id,
    company_id,
    temperature,
    humidity,
    airflow,
    odor_distance,
    weather,
    submission_timezone,
    global_submission_id,
    is_device_generated,
    created_by_device_id, -- CRITICAL: Set to SYSTEM device to satisfy constraint
    created_by, -- Must be NULL when created_by_device_id is set
    notes,
    created_at
  ) VALUES (
    p_site_id,
    v_program_id,
    v_company_id,
    v_temperature,
    v_humidity,
    v_airflow::airflow_enum,
    v_odor_distance::odor_distance_enum,
    v_weather::weather_enum,
    v_submission_timezone,
    v_global_submission_id,
    TRUE, -- is_device_generated
    v_system_device_id, -- System device as creator
    NULL, -- no user created this
    'Automated device submission shell created for site daily session',
    (p_session_date || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_submission_timezone
  )
  RETURNING submission_id INTO v_submission_id;

  -- ========================================
  -- Step 10: Create paired submission_sessions row
  -- ========================================
  INSERT INTO submission_sessions (
    submission_id,
    site_id,
    program_id,
    opened_by_user_id,
    session_status,
    session_start_time,
    completion_time
  ) VALUES (
    v_submission_id,
    p_site_id,
    v_program_id,
    NULL, -- system-generated
    'Opened', -- Will be set to 'Completed' by end-of-day locker
    (p_session_date || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_submission_timezone,
    NULL -- Will be set by end-of-day locker
  );

  -- ========================================
  -- Step 11: Return submission_id
  -- ========================================
  RETURN v_submission_id;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error if async_error_logs table exists
    BEGIN
      INSERT INTO async_error_logs (
        table_name,
        trigger_name,
        function_name,
        status,
        error_message,
        error_details
      ) VALUES (
        'submissions',
        'device_submission_shell',
        'fn_get_or_create_device_submission',
        'error',
        SQLERRM,
        jsonb_build_object(
          'site_id', p_site_id,
          'session_date', p_session_date,
          'error_detail', SQLSTATE
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Ignore logging errors
      NULL;
    END;
    RAISE;
END;
$$;

COMMENT ON FUNCTION fn_get_or_create_device_submission(UUID, DATE) IS
'[FIXED] Idempotently creates or retrieves a device submission shell for a given site and date. Uses SYSTEM device as creator to satisfy constraint. Enum values now match database schema.';

-- ==========================================
-- 4. Grant Permissions
-- ==========================================

GRANT EXECUTE ON FUNCTION fn_get_or_create_device_submission(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_or_create_device_submission(UUID, DATE) TO service_role;

-- ==========================================
-- 5. Verification Query
-- ==========================================

-- You can run this query after migration to verify:
-- SELECT auto_create_daily_sessions();
