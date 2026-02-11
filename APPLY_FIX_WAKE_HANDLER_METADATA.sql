/*
  # Fix metadata persistence in fn_wake_ingestion_handler

  1. Problem
    - The INSERT path for new device_images was writing `'{}'::JSONB` instead of
      the actual telemetry payload, so temperature, humidity, pressure, and
      gas_resistance generated-stored columns were always NULL.
    - The UPDATE (resume) path never set the metadata column at all, so resumed
      images also had empty metadata.

  2. Changes
    - **INSERT path**: replaced `'{}'::JSONB` with `p_telemetry_data` for the
      `metadata` column when creating a new device_images row.
    - **UPDATE (resume) path**: added `metadata = p_telemetry_data` to the SET
      clause so resumed images get the latest sensor readings.

  3. Impact
    - Going forward, every device_images row created or resumed by this function
      will have its metadata populated, and the generated columns (temperature,
      humidity, pressure, gas_resistance) will compute automatically.
    - No changes to function signature or return type; no JS changes required.

  APPLY VIA: Supabase SQL Editor
  https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql
*/

CREATE OR REPLACE FUNCTION fn_wake_ingestion_handler(
  p_device_id UUID,
  p_captured_at TIMESTAMPTZ,
  p_image_name TEXT,
  p_telemetry_data JSONB,
  p_existing_image_id UUID DEFAULT NULL
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

  v_session_date := DATE(p_captured_at);

  SELECT session_id INTO v_session_id
  FROM site_device_sessions
  WHERE site_id = v_site_id
    AND session_date = v_session_date;

  IF v_session_id IS NULL THEN
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

  SELECT wake_index, is_overage
  INTO v_wake_index, v_is_overage
  FROM fn_infer_wake_window_index(p_captured_at, v_cron_expression);

  INSERT INTO device_wake_payloads (
    company_id, program_id, site_id, site_device_session_id, device_id,
    captured_at, wake_window_index, overage_flag,
    temperature, humidity, pressure, gas_resistance, battery_voltage, wifi_rssi,
    telemetry_data, image_status, payload_status, wake_type, protocol_state
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
    'complete',
    CASE WHEN p_image_name IS NOT NULL THEN 'image_wake' ELSE 'telemetry_only' END,
    CASE WHEN p_existing_image_id IS NOT NULL THEN 'metadata_received_resume' ELSE 'metadata_received' END
  )
  RETURNING payload_id INTO v_payload_id;

  IF p_image_name IS NOT NULL THEN
    IF p_existing_image_id IS NOT NULL THEN
      v_image_id := p_existing_image_id;

      UPDATE device_images
      SET captured_at = p_captured_at,
          status = 'receiving',
          metadata = p_telemetry_data,
          company_id = v_company_id,
          program_id = v_program_id,
          site_id = v_site_id,
          site_device_session_id = v_session_id,
          updated_at = NOW()
      WHERE image_id = v_image_id;
    ELSE
      INSERT INTO device_images (
        device_id, image_name, captured_at, status, total_chunks, metadata,
        company_id, program_id, site_id, site_device_session_id
      ) VALUES (
        p_device_id, p_image_name, p_captured_at, 'receiving', 0, p_telemetry_data,
        v_company_id, v_program_id, v_site_id, v_session_id
      )
      RETURNING image_id INTO v_image_id;
    END IF;

    UPDATE device_wake_payloads
    SET image_id = v_image_id
    WHERE payload_id = v_payload_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payload_id', v_payload_id,
    'image_id', v_image_id,
    'session_id', v_session_id,
    'wake_index', v_wake_index,
    'is_resume', (p_existing_image_id IS NOT NULL)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'message', 'Wake ingestion failed'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_wake_ingestion_handler IS
'Handle wake event ingestion with resume support. Creates wake payload and image record with full telemetry metadata. If p_existing_image_id provided, updates existing image instead of creating new one.';
