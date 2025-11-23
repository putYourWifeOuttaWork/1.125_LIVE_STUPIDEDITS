/*
  # Fix Wake Payload Immediate Completion

  ## Problem
  Wake payloads were created with payload_status='pending' and only marked 'complete'
  when an image finished transmission. This left telemetry-only wakes stuck in 'pending'
  forever, causing all session counters to show zero.

  ## Solution
  A "wake" is a binary event - it either happened or it didn't. When a device wakes up
  and transmits data (with or without an image), the wake itself is complete immediately.
  The image transmission status is tracked separately via image_status.

  ## Changes
  1. Update fn_wake_ingestion_handler to create payloads with payload_status='complete'
  2. Image status remains separate and tracked independently
  3. Wake counters will now increment immediately when device transmits
  4. Failed wakes (timeout/no contact) will be handled by timeout system
*/

-- Fix the wake ingestion handler to mark payloads complete immediately
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

  -- Step 3: Create device_wake_payloads
  -- FIXED: payload_status='complete' immediately (wake happened when device transmitted)
  -- image_status tracks image transmission separately
  INSERT INTO device_wake_payloads (
    company_id, program_id, site_id, site_device_session_id, device_id,
    captured_at, wake_window_index, overage_flag,
    temperature, humidity, pressure, gas_resistance, battery_voltage, wifi_rssi,
    telemetry_data, image_status, payload_status
  ) VALUES (
    v_company_id, v_program_id, v_site_id, v_session_id, p_device_id,
    p_captured_at, v_wake_index, v_is_overage,
    (p_telemetry_data->>'temperature')::NUMERIC,
    (p_telemetry_data->>'humidity')::NUMERIC,
    (p_telemetry_data->>'pressure')::NUMERIC,
    (p_telemetry_data->>'gas_resistance')::NUMERIC,
    (p_telemetry_data->>'battery_voltage')::NUMERIC,
    (p_telemetry_data->>'wifi_rssi')::INT,
    p_telemetry_data,
    CASE WHEN p_image_name IS NOT NULL THEN 'pending' ELSE NULL END,
    'complete'  -- Wake is complete as soon as device transmits
  )
  RETURNING payload_id INTO v_payload_id;

  -- Step 4: Create device_images row if image expected
  IF p_image_name IS NOT NULL THEN
    INSERT INTO device_images (
      device_id,
      image_name,
      captured_at,
      status,
      total_chunks,
      metadata,
      company_id,
      program_id,
      site_id,
      site_device_session_id
    ) VALUES (
      p_device_id,
      p_image_name,
      p_captured_at,
      'receiving',
      0,
      '{}'::JSONB,
      v_company_id,
      v_program_id,
      v_site_id,
      v_session_id
    )
    RETURNING image_id INTO v_image_id;

    -- Link image to wake payload
    UPDATE device_wake_payloads
    SET image_id = v_image_id
    WHERE payload_id = v_payload_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payload_id', v_payload_id,
    'image_id', v_image_id,
    'session_id', v_session_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_wake_ingestion_handler IS
'Creates wake payload with immediate completion status. A wake is complete when device transmits, regardless of image status. Image transmission is tracked separately via image_status field.';
