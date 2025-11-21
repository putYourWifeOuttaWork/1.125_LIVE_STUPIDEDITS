/*
  # Fix device_images and device_wake_payloads Context Population

  ## Problem
  The fn_wake_ingestion_handler function is creating device_images records
  but NOT populating critical foreign keys:
  - program_id = NULL
  - site_id = NULL
  - site_device_session_id = NULL
  - wake_payload_id = NULL (linked later but should be immediate)

  Also, battery_voltage and wifi_rssi from the payload are not being
  extracted from the telemetry_data JSONB.

  ## Solution
  Update fn_wake_ingestion_handler to:
  1. Populate ALL foreign keys in device_images
  2. Extract battery_voltage and wifi_rssi from telemetry_data
  3. Ensure proper linking between tables
*/

-- ==========================================
-- FIX: WAKE INGESTION HANDLER
-- ==========================================

CREATE OR REPLACE FUNCTION fn_wake_ingestion_handler(
  p_device_id UUID,
  p_captured_at TIMESTAMPTZ,
  p_image_name TEXT,
  p_telemetry_data JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_company_id UUID;
  v_program_id UUID;
  v_site_id UUID;
  v_session_id UUID;
  v_session_date DATE;
  v_wake_index INT;
  v_is_overage BOOLEAN;
  v_cron_expression TEXT;
  v_payload_id UUID;
  v_image_id UUID;
  v_battery_voltage NUMERIC;
  v_wifi_rssi INT;
BEGIN
  -- Step 1: Resolve lineage
  SELECT
    dsa.site_id,
    s.program_id,
    p.company_id,
    d.wake_schedule_cron
  INTO v_site_id, v_program_id, v_company_id, v_cron_expression
  FROM devices d
  JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
  JOIN sites s ON dsa.site_id = s.site_id
  JOIN pilot_programs p ON s.program_id = p.program_id
  WHERE d.device_id = p_device_id
    AND dsa.is_active = TRUE
    AND dsa.is_primary = TRUE;

  IF v_site_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Device not assigned to active site'
    );
  END IF;

  -- Get session date from captured_at
  v_session_date := DATE(p_captured_at);

  -- Get or create session
  SELECT session_id INTO v_session_id
  FROM site_device_sessions
  WHERE site_id = v_site_id
    AND session_date = v_session_date;

  IF v_session_id IS NULL THEN
    -- Create session on-the-fly (handles late wakes)
    INSERT INTO site_device_sessions (
      company_id, program_id, site_id,
      session_date, session_start_time, session_end_time,
      expected_wake_count, status
    ) VALUES (
      v_company_id, v_program_id, v_site_id,
      v_session_date,
      DATE_TRUNC('day', p_captured_at),
      DATE_TRUNC('day', p_captured_at) + INTERVAL '1 day',
      0, 'in_progress'
    )
    RETURNING session_id INTO v_session_id;
  END IF;

  -- Step 2: Infer wake window index
  SELECT wake_index, is_overage
  INTO v_wake_index, v_is_overage
  FROM fn_infer_wake_window_index(p_captured_at, v_cron_expression);

  -- Extract battery and wifi from telemetry_data if present
  v_battery_voltage := (p_telemetry_data->>'battery_voltage')::NUMERIC;
  v_wifi_rssi := (p_telemetry_data->>'wifi_rssi')::INT;

  -- Step 3: Create device_wake_payloads WITH BATTERY & WIFI
  INSERT INTO device_wake_payloads (
    company_id, program_id, site_id, site_device_session_id, device_id,
    captured_at, wake_window_index, overage_flag,
    temperature, humidity, pressure, gas_resistance,
    battery_voltage, wifi_rssi,  -- ✅ NOW EXTRACTED
    telemetry_data, image_status, payload_status
  ) VALUES (
    v_company_id, v_program_id, v_site_id, v_session_id, p_device_id,
    p_captured_at, v_wake_index, v_is_overage,
    (p_telemetry_data->>'temperature')::NUMERIC,
    (p_telemetry_data->>'humidity')::NUMERIC,
    (p_telemetry_data->>'pressure')::NUMERIC,
    (p_telemetry_data->>'gas_resistance')::NUMERIC,
    v_battery_voltage,  -- ✅ EXTRACTED
    v_wifi_rssi,        -- ✅ EXTRACTED
    p_telemetry_data,
    'pending', 'pending'
  )
  RETURNING payload_id INTO v_payload_id;

  -- Step 4: Create device_images row WITH FULL CONTEXT
  INSERT INTO device_images (
    device_id,
    image_name,
    captured_at,
    status,
    total_chunks,
    metadata,
    company_id,               -- ✅ ALREADY HAD
    program_id,               -- ✅ NOW ADDED
    site_id,                  -- ✅ NOW ADDED
    site_device_session_id,   -- ✅ NOW ADDED
    wake_payload_id,          -- ✅ NOW ADDED
    original_capture_date
  ) VALUES (
    p_device_id,
    p_image_name,
    p_captured_at,
    'receiving',
    (p_telemetry_data->>'total_chunks')::INT,
    p_telemetry_data,
    v_company_id,             -- ✅ ALREADY HAD
    v_program_id,             -- ✅ NOW POPULATED
    v_site_id,                -- ✅ NOW POPULATED
    v_session_id,             -- ✅ NOW POPULATED
    v_payload_id,             -- ✅ NOW POPULATED
    v_session_date
  )
  ON CONFLICT (device_id, image_name) DO UPDATE
  SET captured_at = EXCLUDED.captured_at,
      metadata = EXCLUDED.metadata,
      program_id = EXCLUDED.program_id,               -- ✅ UPDATE ON CONFLICT
      site_id = EXCLUDED.site_id,                     -- ✅ UPDATE ON CONFLICT
      site_device_session_id = EXCLUDED.site_device_session_id,  -- ✅ UPDATE ON CONFLICT
      wake_payload_id = EXCLUDED.wake_payload_id,     -- ✅ UPDATE ON CONFLICT
      updated_at = NOW()
  RETURNING image_id INTO v_image_id;

  -- Link image to payload
  UPDATE device_wake_payloads
  SET image_id = v_image_id,
      image_status = 'receiving'
  WHERE payload_id = v_payload_id;

  -- Step 5: Update session counters if overage
  IF v_is_overage THEN
    UPDATE site_device_sessions
    SET extra_wake_count = extra_wake_count + 1
    WHERE session_id = v_session_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payload_id', v_payload_id,
    'image_id', v_image_id,
    'session_id', v_session_id,
    'wake_index', v_wake_index,
    'is_overage', v_is_overage
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_wake_ingestion_handler(UUID, TIMESTAMPTZ, TEXT, JSONB) IS
'Process device wake metadata. Create payload and image records with FULL CONTEXT (program_id, site_id, session_id, wake_payload_id). Extract battery and wifi from telemetry. Infer wake index and update counters.';

-- ==========================================
-- SUCCESS MESSAGE
-- ==========================================

DO $$
BEGIN
  RAISE NOTICE '✅ fn_wake_ingestion_handler updated successfully';
  RAISE NOTICE '   - device_images now populates: program_id, site_id, site_device_session_id, wake_payload_id';
  RAISE NOTICE '   - device_wake_payloads now extracts: battery_voltage, wifi_rssi';
  RAISE NOTICE '   - All context properly inherited from device lineage';
END $$;
