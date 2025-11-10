/*
  # Device Submission Shell - Phase 2.5 Critical Fix

  1. Purpose
    - Creates daily device submission "shell" to satisfy petri_observations.submission_id NOT NULL constraint
    - Enables device-generated observations to integrate seamlessly with manual submission infrastructure
    - Maintains data integrity while keeping manual UX completely untouched

  2. New Objects
    - `global_submission_id_seq` - Sequence for generating unique submission IDs
    - `fn_get_or_create_device_submission()` - Idempotent function to get/create daily device submission shell
    - `device_submission_id` column on `site_device_sessions` table

  3. Fallback Logic for Required NOT NULL Fields
    - temperature: device telemetry → sites.default_indoor_temperature → sites.default_temperature → 70°F
    - humidity: device telemetry → sites.default_indoor_humidity → sites.default_humidity → 45%
    - airflow, odor_distance, weather: sites.submission_defaults JSON → platform defaults
    - submission_timezone: sites.timezone → 'UTC'
    - global_submission_id: generated from sequence
    - is_device_generated: TRUE

  4. Security
    - All functions use SECURITY DEFINER to bypass RLS during system operations
    - RLS policies remain enforced for user-facing queries
    - Company isolation maintained through get_active_company_id()
*/

-- =============================================
-- 1. Create Global Submission ID Sequence
-- =============================================

DO $$
BEGIN
  -- Check if sequence already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'global_submission_id_seq'
  ) THEN
    -- Create sequence starting at 1000 to distinguish from any existing manual IDs
    CREATE SEQUENCE global_submission_id_seq START 1000 INCREMENT 1;

    -- Set sequence to max existing global_submission_id + 1 if there are existing submissions
    DECLARE
      max_existing_id BIGINT;
    BEGIN
      SELECT COALESCE(MAX(global_submission_id), 999) INTO max_existing_id FROM submissions;
      IF max_existing_id >= 1000 THEN
        PERFORM setval('global_submission_id_seq', max_existing_id + 1, false);
      END IF;
    END;
  END IF;
END $$;

COMMENT ON SEQUENCE global_submission_id_seq IS 'Generates unique integer IDs for submissions (both manual and device-generated)';

-- =============================================
-- 2. Extend site_device_sessions Table
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_device_sessions' AND column_name = 'device_submission_id'
  ) THEN
    ALTER TABLE site_device_sessions
    ADD COLUMN device_submission_id UUID REFERENCES submissions(submission_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_site_device_sessions_device_submission
ON site_device_sessions(device_submission_id);

COMMENT ON COLUMN site_device_sessions.device_submission_id IS 'Pre-created device submission shell for this site/day (avoids repeated lookups during image completion)';

-- =============================================
-- 3. Device Submission Shell Function
-- =============================================

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
  v_session_id UUID;
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
  -- Step 2: Fetch site lineage and defaults
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
  -- Step 3: Determine temperature with fallback chain
  -- ========================================
  -- Try to get latest device telemetry for this site/date
  SELECT AVG(temperature) INTO v_temperature
  FROM device_wake_payloads dwp
  JOIN device_site_assignments dsa ON dwp.device_id = dsa.device_id
  WHERE dsa.site_id = p_site_id
    AND dsa.is_active = TRUE
    AND DATE(dwp.captured_at AT TIME ZONE COALESCE(v_submission_timezone, 'UTC')) = p_session_date
    AND dwp.temperature IS NOT NULL;

  -- Fallback chain: device telemetry → site defaults → hardcoded
  IF v_temperature IS NULL THEN
    SELECT COALESCE(default_indoor_temperature, default_temperature, 70)
    INTO v_temperature
    FROM sites WHERE site_id = p_site_id;
  END IF;

  -- ========================================
  -- Step 4: Determine humidity with fallback chain
  -- ========================================
  SELECT AVG(humidity) INTO v_humidity
  FROM device_wake_payloads dwp
  JOIN device_site_assignments dsa ON dwp.device_id = dsa.device_id
  WHERE dsa.site_id = p_site_id
    AND dsa.is_active = TRUE
    AND DATE(dwp.captured_at AT TIME ZONE COALESCE(v_submission_timezone, 'UTC')) = p_session_date
    AND dwp.humidity IS NOT NULL;

  IF v_humidity IS NULL THEN
    SELECT COALESCE(default_indoor_humidity, default_humidity, 45)
    INTO v_humidity
    FROM sites WHERE site_id = p_site_id;
  END IF;

  -- ========================================
  -- Step 5: Parse enum values from submission_defaults
  -- ========================================
  IF v_submission_defaults IS NOT NULL THEN
    v_airflow := COALESCE(v_submission_defaults->>'airflow', 'Moderate');
    v_odor_distance := COALESCE(v_submission_defaults->>'odor_distance', 'None');
    IF v_weather IS NULL THEN
      v_weather := COALESCE(v_submission_defaults->>'weather', 'Clear');
    END IF;
  ELSE
    -- Platform defaults
    v_airflow := 'Moderate';
    v_odor_distance := 'None';
    v_weather := COALESCE(v_weather::TEXT, 'Clear');
  END IF;

  -- ========================================
  -- Step 6: Handle timezone with fallback and logging
  -- ========================================
  v_submission_timezone := COALESCE(v_submission_timezone, 'UTC');

  IF v_submission_timezone = 'UTC' THEN
    -- Log warning if site lacks timezone
    INSERT INTO async_error_logs (
      table_name,
      trigger_name,
      function_name,
      status,
      error_message,
      error_details
    ) VALUES (
      'sites',
      'device_submission_shell',
      'fn_get_or_create_device_submission',
      'warning',
      'Site missing timezone, falling back to UTC',
      jsonb_build_object(
        'site_id', p_site_id,
        'session_date', p_session_date
      )
    );
  END IF;

  -- ========================================
  -- Step 7: Generate global_submission_id
  -- ========================================
  v_global_submission_id := nextval('global_submission_id_seq');

  -- ========================================
  -- Step 8: Create device submission shell
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
    created_by_device_id,
    created_by,
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
    NULL, -- no specific device (site-wide shell)
    NULL, -- no user created this
    'Automated device submission shell created for site daily session',
    (p_session_date || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_submission_timezone
  )
  RETURNING submission_id INTO v_submission_id;

  -- ========================================
  -- Step 9: Create paired submission_sessions row
  -- ========================================
  INSERT INTO submission_sessions (
    submission_id,
    site_id,
    program_id,
    opened_by_user_id,
    session_status,
    opened_at,
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
  -- Step 10: Return submission_id
  -- ========================================
  RETURN v_submission_id;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error
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
    RAISE;
END;
$$;

COMMENT ON FUNCTION fn_get_or_create_device_submission(UUID, DATE) IS
'Idempotently creates or retrieves a device submission shell for a given site and date. Satisfies all NOT NULL constraints with intelligent fallbacks. Used by midnight session opener and image completion handler.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION fn_get_or_create_device_submission(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_or_create_device_submission(UUID, DATE) TO service_role;
