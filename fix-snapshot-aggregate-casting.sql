/*
  # Fix Snapshot Aggregate Casting

  The snapshot function has an error where it tries to AVG() text values.
  Need to cast to numeric BEFORE aggregating, not after.
*/

CREATE OR REPLACE FUNCTION generate_session_wake_snapshot(
  p_session_id uuid,
  p_wake_number integer,
  p_wake_round_start timestamptz,
  p_wake_round_end timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot_id uuid;
  v_site_id uuid;
  v_program_id uuid;
  v_company_id uuid;
  v_site_state jsonb;
  v_active_devices_count integer;
  v_new_images_count integer;
  v_new_alerts_count integer;
  v_avg_temp numeric;
  v_avg_humidity numeric;
  v_avg_mgi numeric;
  v_max_mgi numeric;
BEGIN
  -- Get session context
  SELECT site_id, program_id, company_id
  INTO v_site_id, v_program_id, v_company_id
  FROM site_device_sessions
  WHERE session_id = p_session_id;

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  -- Count active devices
  SELECT COUNT(*) INTO v_active_devices_count
  FROM devices
  WHERE site_id = v_site_id AND is_active = true;

  -- Count images in this round (from wake_payloads)
  SELECT COUNT(DISTINCT dwp.image_id) INTO v_new_images_count
  FROM device_wake_payloads dwp
  WHERE dwp.site_device_session_id = p_session_id
    AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
    AND dwp.image_id IS NOT NULL;

  -- Count alerts in this round
  SELECT COUNT(*) INTO v_new_alerts_count
  FROM device_alerts
  WHERE site_id = v_site_id
    AND triggered_at BETWEEN p_wake_round_start AND p_wake_round_end;

  -- Build site_state JSONB
  v_site_state := jsonb_build_object(
    'session_id', p_session_id,
    'wake_number', p_wake_number,
    'site_id', v_site_id,
    'devices', (
      SELECT jsonb_agg(device_info)
      FROM (
        SELECT jsonb_build_object(
          'device_id', d.device_id,
          'device_code', d.device_code,
          'device_name', d.device_name,
          'position', jsonb_build_object('x', d.x_position, 'y', d.y_position),
          'telemetry', (
            SELECT jsonb_build_object(
              'temperature', temperature,
              'humidity', humidity,
              'pressure', pressure
            )
            FROM device_wake_payloads
            WHERE device_id = d.device_id
              AND site_device_session_id = p_session_id
              AND captured_at BETWEEN p_wake_round_start AND p_wake_round_end
              AND temperature IS NOT NULL
            ORDER BY captured_at DESC
            LIMIT 1
          )
        ) as device_info
        FROM devices d
        WHERE d.site_id = v_site_id AND d.is_active = true
      ) devices_list
    )
  );

  -- Calculate aggregate metrics from wake_payloads directly
  SELECT
    AVG(temperature),
    AVG(humidity)
  INTO v_avg_temp, v_avg_humidity
  FROM device_wake_payloads
  WHERE site_device_session_id = p_session_id
    AND captured_at BETWEEN p_wake_round_start AND p_wake_round_end
    AND temperature IS NOT NULL;

  -- Calculate MGI from images
  SELECT
    AVG(mgi_score),
    MAX(mgi_score)
  INTO v_avg_mgi, v_max_mgi
  FROM device_images di
  JOIN device_wake_payloads dwp ON dwp.image_id = di.image_id
  WHERE dwp.site_device_session_id = p_session_id
    AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
    AND di.mgi_score IS NOT NULL;

  -- Insert snapshot
  INSERT INTO session_wake_snapshots (
    company_id, program_id, site_id, session_id,
    wake_number, wake_round_start, wake_round_end,
    site_state,
    active_devices_count, new_images_this_round, new_alerts_this_round,
    avg_temperature, avg_humidity, avg_mgi, max_mgi
  ) VALUES (
    v_company_id, v_program_id, v_site_id, p_session_id,
    p_wake_number, p_wake_round_start, p_wake_round_end,
    v_site_state,
    v_active_devices_count, v_new_images_count, v_new_alerts_count,
    v_avg_temp, v_avg_humidity, v_avg_mgi, v_max_mgi
  )
  RETURNING snapshot_id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

COMMENT ON FUNCTION generate_session_wake_snapshot IS 'Generate snapshot from wake_payloads with proper numeric casting';
