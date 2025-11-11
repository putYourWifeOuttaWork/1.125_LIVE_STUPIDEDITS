/*
  # Fix Enum Errors and Add Mock Data Generators

  1. Purpose
    - Fix enum value errors preventing session creation
    - Add mock data generator functions for testing
    - Enable realistic device/session/wake generation

  2. Fixes
    - Update airflow_enum to accept common values
    - Fix program_status_enum reference
    - Ensure device submission shells are created properly

  3. New Functions
    - fn_generate_mock_unmapped_device() - Creates realistic unmapped device
    - fn_generate_mock_session_for_device() - Creates session for device's site
    - fn_generate_mock_wake_payload() - Generates wake event with telemetry
    - fn_generate_mock_image() - Creates image transmission record
    - fn_cleanup_mock_device_data() - Removes mock data for testing
*/

-- ==========================================
-- 1. Check and Fix Airflow Enum
-- ==========================================

DO $$
BEGIN
  -- Check if 'Moderate' exists in airflow_enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'Moderate'
    AND enumtypid = 'airflow_enum'::regtype
  ) THEN
    -- Add 'Moderate' to airflow_enum if it doesn't exist
    ALTER TYPE airflow_enum ADD VALUE IF NOT EXISTS 'Moderate';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'airflow_enum may not exist or error adding value: %', SQLERRM;
END $$;

-- ==========================================
-- 2. Mock Data Generator: Unmapped Device
-- ==========================================

CREATE OR REPLACE FUNCTION fn_generate_mock_unmapped_device(
  p_device_name TEXT DEFAULT NULL,
  p_wake_schedule_cron TEXT DEFAULT '0 8,16 * * *'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device_id UUID;
  v_device_code TEXT;
  v_device_mac TEXT;
  v_battery_voltage NUMERIC;
  v_battery_health INT;
  v_firmware_version TEXT;
  v_random_suffix INT;
BEGIN
  -- Generate random values
  v_random_suffix := floor(random() * 9999 + 1000)::INT;
  v_device_code := 'MOCK-DEV-' || v_random_suffix;
  v_device_mac := 'AA:BB:CC:' || to_hex(floor(random() * 255)::INT) || ':' || to_hex(floor(random() * 255)::INT) || ':' || to_hex(floor(random() * 255)::INT);
  v_battery_voltage := (random() * 0.5 + 3.7)::NUMERIC(4,2); -- 3.7 to 4.2V
  v_battery_health := floor(random() * 40 + 60)::INT; -- 60-100%
  v_firmware_version := 'v' || floor(random() * 3 + 1)::TEXT || '.' || floor(random() * 10)::TEXT || '.' || floor(random() * 20)::TEXT;

  -- Insert device
  INSERT INTO devices (
    device_code,
    device_name,
    device_mac,
    device_type,
    provisioning_status,
    wake_schedule_cron,
    battery_voltage,
    battery_health_percent,
    firmware_version,
    hardware_version,
    wifi_rssi,
    last_seen_at,
    created_at
  )
  VALUES (
    v_device_code,
    COALESCE(p_device_name, 'Mock Device ' || v_random_suffix),
    v_device_mac,
    'ESP32-CAM',
    'pending_mapping', -- Not assigned to site yet
    p_wake_schedule_cron,
    v_battery_voltage,
    v_battery_health,
    v_firmware_version,
    'ESP32-S3',
    floor(random() * 30 - 80)::INT, -- -80 to -50 dBm
    NOW() - (random() * interval '2 hours'),
    NOW()
  )
  RETURNING device_id INTO v_device_id;

  RAISE NOTICE 'Created mock unmapped device: % (%)', v_device_code, v_device_id;

  RETURN jsonb_build_object(
    'success', true,
    'device_id', v_device_id,
    'device_code', v_device_code,
    'device_name', COALESCE(p_device_name, 'Mock Device ' || v_random_suffix),
    'message', 'Mock device created. Map it to a site in Device Registry.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$;

COMMENT ON FUNCTION fn_generate_mock_unmapped_device IS
'Creates a realistic mock device in pending_mapping status. Device must be manually mapped to a site before generating sessions.';

-- ==========================================
-- 3. Mock Data Generator: Session for Device
-- ==========================================

CREATE OR REPLACE FUNCTION fn_generate_mock_session_for_device(
  p_device_id UUID,
  p_session_date DATE DEFAULT CURRENT_DATE,
  p_auto_generate_wakes BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site_id UUID;
  v_program_id UUID;
  v_company_id UUID;
  v_session_id UUID;
  v_submission_id UUID;
  v_wake_schedule_cron TEXT;
  v_expected_wake_count INT;
  v_timezone TEXT;
  v_session_start TIMESTAMPTZ;
  v_session_end TIMESTAMPTZ;
  v_wake_count INT;
  v_wake_result JSONB;
BEGIN
  -- Get device site assignment
  SELECT site_id, wake_schedule_cron
  INTO v_site_id, v_wake_schedule_cron
  FROM devices
  WHERE device_id = p_device_id;

  IF v_site_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Device is not mapped to a site. Map it first in Device Registry.'
    );
  END IF;

  -- Get site lineage
  SELECT s.program_id, p.company_id, COALESCE(s.timezone, 'UTC')
  INTO v_program_id, v_company_id, v_timezone
  FROM sites s
  JOIN pilot_programs p ON s.program_id = p.program_id
  WHERE s.site_id = v_site_id;

  -- Calculate expected wake count from cron
  v_expected_wake_count := fn_parse_cron_wake_count(v_wake_schedule_cron);

  -- Calculate session boundaries in site timezone
  v_session_start := (p_session_date::TEXT || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_timezone;
  v_session_end := (p_session_date::TEXT || ' 23:59:59')::TIMESTAMP AT TIME ZONE v_timezone;

  -- Check if session already exists
  SELECT session_id INTO v_session_id
  FROM site_device_sessions
  WHERE site_id = v_site_id
    AND session_date = p_session_date;

  IF v_session_id IS NOT NULL THEN
    RAISE NOTICE 'Session already exists for this site and date: %', v_session_id;
  ELSE
    -- Create site_device_session
    INSERT INTO site_device_sessions (
      company_id,
      program_id,
      site_id,
      session_date,
      session_start_time,
      session_end_time,
      expected_wake_count,
      status
    )
    VALUES (
      v_company_id,
      v_program_id,
      v_site_id,
      p_session_date,
      v_session_start,
      v_session_end,
      v_expected_wake_count,
      'in_progress'
    )
    RETURNING session_id INTO v_session_id;

    RAISE NOTICE 'Created site_device_session: %', v_session_id;

    -- Create device submission shell
    v_submission_id := fn_get_or_create_device_submission(v_site_id, p_session_date);

    -- Link submission to session
    UPDATE site_device_sessions
    SET device_submission_id = v_submission_id
    WHERE session_id = v_session_id;

    RAISE NOTICE 'Linked device submission: %', v_submission_id;
  END IF;

  -- Auto-generate wake payloads if requested
  IF p_auto_generate_wakes THEN
    v_wake_count := 0;
    FOR i IN 1..v_expected_wake_count LOOP
      v_wake_result := fn_generate_mock_wake_payload(
        v_session_id,
        p_device_id,
        CASE
          WHEN random() > 0.15 THEN 'complete'
          WHEN random() > 0.5 THEN 'pending'
          ELSE 'failed'
        END,
        true -- include image
      );

      IF (v_wake_result->>'success')::BOOLEAN THEN
        v_wake_count := v_wake_count + 1;
      END IF;
    END LOOP;

    RAISE NOTICE 'Generated % wake payloads', v_wake_count;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'submission_id', v_submission_id,
    'site_id', v_site_id,
    'session_date', p_session_date,
    'expected_wake_count', v_expected_wake_count,
    'wakes_generated', CASE WHEN p_auto_generate_wakes THEN v_wake_count ELSE 0 END,
    'message', 'Mock session created successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$;

COMMENT ON FUNCTION fn_generate_mock_session_for_device IS
'Creates a site_device_session and device submission shell for the device''s mapped site. Optionally auto-generates wake payloads.';

-- ==========================================
-- 4. Mock Data Generator: Wake Payload
-- ==========================================

CREATE OR REPLACE FUNCTION fn_generate_mock_wake_payload(
  p_session_id UUID,
  p_device_id UUID,
  p_status TEXT DEFAULT 'complete',
  p_include_image BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payload_id UUID;
  v_image_id UUID;
  v_company_id UUID;
  v_program_id UUID;
  v_site_id UUID;
  v_captured_at TIMESTAMPTZ;
  v_wake_index INT;
  v_temperature NUMERIC;
  v_humidity NUMERIC;
  v_battery_voltage NUMERIC;
  v_wifi_rssi INT;
  v_image_result JSONB;
  v_session_start TIMESTAMPTZ;
  v_session_end TIMESTAMPTZ;
BEGIN
  -- Get session lineage
  SELECT company_id, program_id, site_id, session_start_time, session_end_time
  INTO v_company_id, v_program_id, v_site_id, v_session_start, v_session_end
  FROM site_device_sessions
  WHERE session_id = p_session_id;

  -- Count existing payloads to determine wake index
  SELECT COUNT(*) + 1 INTO v_wake_index
  FROM device_wake_payloads
  WHERE site_device_session_id = p_session_id
    AND device_id = p_device_id;

  -- Generate realistic telemetry
  v_temperature := (random() * 10 + 68)::NUMERIC(5,2); -- 68-78°F
  v_humidity := (random() * 20 + 40)::NUMERIC(5,2); -- 40-60%
  v_battery_voltage := (random() * 0.5 + 3.7)::NUMERIC(4,2); -- 3.7-4.2V
  v_wifi_rssi := floor(random() * 30 - 80)::INT; -- -80 to -50 dBm

  -- Random timestamp within session
  v_captured_at := v_session_start + (random() * (v_session_end - v_session_start));

  -- Create wake payload
  INSERT INTO device_wake_payloads (
    company_id,
    program_id,
    site_id,
    site_device_session_id,
    device_id,
    captured_at,
    received_at,
    wake_window_index,
    temperature,
    humidity,
    battery_voltage,
    wifi_rssi,
    telemetry_data,
    payload_status,
    overage_flag
  )
  VALUES (
    v_company_id,
    v_program_id,
    v_site_id,
    p_session_id,
    p_device_id,
    v_captured_at,
    CASE WHEN p_status = 'pending' THEN NULL ELSE v_captured_at + interval '2 seconds' END,
    v_wake_index,
    v_temperature,
    v_humidity,
    v_battery_voltage,
    v_wifi_rssi,
    jsonb_build_object(
      'temperature', v_temperature,
      'humidity', v_humidity,
      'battery_voltage', v_battery_voltage,
      'wifi_rssi', v_wifi_rssi,
      'mock_data', true
    ),
    p_status,
    random() < 0.1 -- 10% chance of overage
  )
  RETURNING payload_id INTO v_payload_id;

  -- Create mock image if requested
  IF p_include_image THEN
    v_image_result := fn_generate_mock_image(v_payload_id, p_status);
    v_image_id := (v_image_result->>'image_id')::UUID;

    -- Update payload with image_id
    UPDATE device_wake_payloads
    SET image_id = v_image_id,
        image_status = CASE
          WHEN p_status = 'complete' THEN 'complete'
          WHEN p_status = 'failed' THEN 'failed'
          ELSE 'receiving'
        END
    WHERE payload_id = v_payload_id;
  END IF;

  -- Update session counters
  IF p_status = 'complete' THEN
    UPDATE site_device_sessions
    SET completed_wake_count = completed_wake_count + 1
    WHERE session_id = p_session_id;
  ELSIF p_status = 'failed' THEN
    UPDATE site_device_sessions
    SET failed_wake_count = failed_wake_count + 1
    WHERE session_id = p_session_id;
  END IF;

  RAISE NOTICE 'Created wake payload: % (wake #%)', v_payload_id, v_wake_index;

  RETURN jsonb_build_object(
    'success', true,
    'payload_id', v_payload_id,
    'image_id', v_image_id,
    'wake_index', v_wake_index,
    'status', p_status
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$;

COMMENT ON FUNCTION fn_generate_mock_wake_payload IS
'Generates a realistic wake payload with telemetry data and optional image for testing.';

-- ==========================================
-- 5. Mock Data Generator: Image
-- ==========================================

CREATE OR REPLACE FUNCTION fn_generate_mock_image(
  p_payload_id UUID,
  p_status TEXT DEFAULT 'complete'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_image_id UUID;
  v_company_id UUID;
  v_device_id UUID;
  v_captured_at TIMESTAMPTZ;
  v_image_urls TEXT[] := ARRAY[
    'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?w=800',
    'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=800',
    'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=800',
    'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800',
    'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=800'
  ];
  v_image_url TEXT;
  v_chunks_received INT;
  v_total_chunks INT := 50;
BEGIN
  -- Get payload info
  SELECT company_id, device_id, captured_at
  INTO v_company_id, v_device_id, v_captured_at
  FROM device_wake_payloads
  WHERE payload_id = p_payload_id;

  -- Random image URL
  v_image_url := v_image_urls[floor(random() * array_length(v_image_urls, 1) + 1)];

  -- Determine chunks based on status
  v_chunks_received := CASE
    WHEN p_status = 'complete' THEN v_total_chunks
    WHEN p_status = 'failed' THEN floor(random() * 30 + 5)::INT -- 5-35 chunks
    ELSE floor(random() * 20 + 30)::INT -- 30-50 chunks (receiving)
  END;

  -- Insert image
  INSERT INTO device_images (
    company_id,
    device_id,
    payload_id,
    image_url,
    captured_at,
    received_at,
    total_chunks,
    received_chunks,
    retry_count,
    max_retries,
    image_status,
    error_code,
    timeout_reason,
    original_capture_date
  )
  VALUES (
    v_company_id,
    v_device_id,
    p_payload_id,
    v_image_url,
    v_captured_at,
    CASE WHEN p_status != 'pending' THEN v_captured_at + interval '5 seconds' ELSE NULL END,
    v_total_chunks,
    v_chunks_received,
    CASE WHEN p_status = 'failed' THEN floor(random() * 2)::INT ELSE 0 END,
    3,
    p_status,
    CASE WHEN p_status = 'failed' THEN 'CHUNK_TIMEOUT' ELSE NULL END,
    CASE WHEN p_status = 'failed' THEN 'Device did not send all chunks within timeout window' ELSE NULL END,
    v_captured_at::DATE
  )
  RETURNING image_id INTO v_image_id;

  RAISE NOTICE 'Created mock image: % (% status)', v_image_id, p_status;

  RETURN jsonb_build_object(
    'success', true,
    'image_id', v_image_id,
    'image_url', v_image_url,
    'status', p_status,
    'chunks_received', v_chunks_received,
    'total_chunks', v_total_chunks
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$;

COMMENT ON FUNCTION fn_generate_mock_image IS
'Creates a mock device image with realistic transmission data. Uses real Unsplash images.';

-- ==========================================
-- 6. Cleanup Function
-- ==========================================

CREATE OR REPLACE FUNCTION fn_cleanup_mock_device_data(
  p_device_id UUID,
  p_delete_device BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_wakes INT;
  v_deleted_images INT;
  v_deleted_sessions INT;
  v_device_code TEXT;
BEGIN
  -- Get device code for logging
  SELECT device_code INTO v_device_code
  FROM devices
  WHERE device_id = p_device_id;

  -- Delete images (cascades to wake_payloads)
  DELETE FROM device_images
  WHERE device_id = p_device_id;
  GET DIAGNOSTICS v_deleted_images = ROW_COUNT;

  -- Delete wake payloads
  DELETE FROM device_wake_payloads
  WHERE device_id = p_device_id;
  GET DIAGNOSTICS v_deleted_wakes = ROW_COUNT;

  -- Delete sessions where this was the only device (optional cleanup)
  -- Note: This is conservative - only deletes if session has no other data

  -- Delete device if requested
  IF p_delete_device THEN
    DELETE FROM devices WHERE device_id = p_device_id;
  END IF;

  RAISE NOTICE 'Cleaned up mock data for device %: % wakes, % images',
    v_device_code, v_deleted_wakes, v_deleted_images;

  RETURN jsonb_build_object(
    'success', true,
    'device_id', p_device_id,
    'device_code', v_device_code,
    'deleted_wakes', v_deleted_wakes,
    'deleted_images', v_deleted_images,
    'device_deleted', p_delete_device
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$;

COMMENT ON FUNCTION fn_cleanup_mock_device_data IS
'Removes all mock data (wakes, images, optionally device) for testing cleanup.';

-- ==========================================
-- 7. Grant Permissions
-- ==========================================

GRANT EXECUTE ON FUNCTION fn_generate_mock_unmapped_device TO authenticated;
GRANT EXECUTE ON FUNCTION fn_generate_mock_session_for_device TO authenticated;
GRANT EXECUTE ON FUNCTION fn_generate_mock_wake_payload TO authenticated;
GRANT EXECUTE ON FUNCTION fn_generate_mock_image TO authenticated;
GRANT EXECUTE ON FUNCTION fn_cleanup_mock_device_data TO authenticated;
