/*
  UPDATE FUNCTION ONLY - Apply this now in Supabase SQL Editor

  This ONLY updates the fn_get_or_create_device_submission function
  to use the correct column name: session_start_time (not opened_at)
*/

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
  -- Check for existing device submission
  SELECT submission_id INTO v_submission_id
  FROM submissions
  WHERE site_id = p_site_id
    AND DATE(created_at AT TIME ZONE COALESCE(
      (SELECT timezone FROM sites WHERE site_id = p_site_id),
      'UTC'
    )) = p_session_date
    AND is_device_generated = TRUE
  LIMIT 1;

  IF v_submission_id IS NOT NULL THEN
    RETURN v_submission_id;
  END IF;

  -- Get SYSTEM device ID
  SELECT device_id INTO v_system_device_id
  FROM devices
  WHERE device_mac = 'SYSTEM:AUTO:GENERATED';

  IF v_system_device_id IS NULL THEN
    RAISE EXCEPTION 'SYSTEM device not found. Run FINAL_FIX_APPLY_NOW.sql first.';
  END IF;

  -- Fetch site lineage and defaults
  SELECT
    s.program_id,
    p.company_id,
    s.timezone,
    s.submission_defaults,
    COALESCE(s.default_indoor_temperature, s.default_temperature, 70),
    COALESCE(s.default_indoor_humidity, s.default_humidity, 45),
    s.default_weather
  INTO
    v_program_id,
    v_company_id,
    v_submission_timezone,
    v_submission_defaults,
    v_temperature,
    v_humidity,
    v_weather
  FROM sites s
  JOIN pilot_programs p ON s.program_id = p.program_id
  WHERE s.site_id = p_site_id;

  IF v_program_id IS NULL THEN
    RAISE EXCEPTION 'Site % not found', p_site_id;
  END IF;

  -- Get device telemetry averages if available
  SELECT AVG(temperature) INTO v_temperature
  FROM device_wake_payloads dwp
  WHERE dwp.site_id = p_site_id
    AND DATE(dwp.captured_at AT TIME ZONE COALESCE(v_submission_timezone, 'UTC')) = p_session_date
    AND dwp.temperature IS NOT NULL;

  SELECT AVG(humidity) INTO v_humidity
  FROM device_wake_payloads dwp
  WHERE dwp.site_id = p_site_id
    AND DATE(dwp.captured_at AT TIME ZONE COALESCE(v_submission_timezone, 'UTC')) = p_session_date
    AND dwp.humidity IS NOT NULL;

  -- Ensure we ALWAYS have valid temperature and humidity (never NULL)
  v_temperature := COALESCE(v_temperature, 70);
  v_humidity := COALESCE(v_humidity, 45);

  -- Parse enum values with SAFE defaults
  IF v_submission_defaults IS NOT NULL THEN
    v_airflow := COALESCE(v_submission_defaults->>'airflow', 'Moderate');
    v_odor_distance := COALESCE(v_submission_defaults->>'odor_distance', 'None');
    v_weather := COALESCE(v_submission_defaults->>'weather', v_weather::TEXT, 'Clear');
  ELSE
    v_airflow := 'Moderate';
    v_odor_distance := 'None';
    v_weather := COALESCE(v_weather::TEXT, 'Clear');
  END IF;

  v_submission_timezone := COALESCE(v_submission_timezone, 'UTC');
  v_global_submission_id := nextval('global_submission_id_seq');

  -- Create device submission shell
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
    TRUE,
    v_system_device_id,
    NULL,
    'Automated device submission shell created for site daily session',
    (p_session_date || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_submission_timezone
  )
  RETURNING submission_id INTO v_submission_id;

  -- Create paired submission_sessions row with CORRECT column name
  INSERT INTO submission_sessions (
    submission_id,
    site_id,
    program_id,
    opened_by_user_id,
    session_status,
    session_start_time,  -- ← CORRECT column name (not opened_at)
    completion_time
  ) VALUES (
    v_submission_id,
    p_site_id,
    v_program_id,
    NULL,
    'Opened',
    (p_session_date || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_submission_timezone,
    NULL
  );

  RETURN v_submission_id;
END;
$$;

-- Test immediately:
-- SELECT auto_create_daily_sessions();
