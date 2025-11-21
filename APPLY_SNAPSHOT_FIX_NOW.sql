-- Quick fix for snapshot generation function
-- Changes:
-- 1. Fix DATE_PART calculation error
-- 2. Use LATEST data AS OF wake time (not DURING wake window)

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

  -- Count images in this round
  SELECT COUNT(*) INTO v_new_images_count
  FROM device_images
  WHERE site_id = v_site_id
    AND captured_at BETWEEN p_wake_round_start AND p_wake_round_end;

  -- Count alerts in this round
  SELECT COUNT(*) INTO v_new_alerts_count
  FROM device_alerts
  WHERE site_id = v_site_id
    AND triggered_at BETWEEN p_wake_round_start AND p_wake_round_end;

  -- Build complete site state JSONB with LATEST data AS OF wake time
  WITH
  device_states AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'device_id', d.device_id,
        'device_code', d.device_code,
        'device_name', d.device_name,
        'device_mac', d.device_mac,
        'position', jsonb_build_object('x', d.x_position, 'y', d.y_position),
        'zone_id', d.zone_id,
        'zone_label', d.zone_label,
        'status', CASE WHEN d.is_active THEN 'active' ELSE 'inactive' END,
        'battery_voltage', d.battery_voltage,
        'battery_health_percent', d.battery_health_percent,
        'last_seen_at', d.last_seen_at,
        'telemetry', (
          SELECT jsonb_build_object(
            'temperature', temperature,
            'humidity', humidity,
            'pressure', pressure,
            'gas_resistance', gas_resistance,
            'wifi_rssi', wifi_rssi,
            'captured_at', captured_at
          )
          FROM device_telemetry dt
          WHERE dt.device_id = d.device_id
            AND dt.captured_at <= p_wake_round_end
          ORDER BY dt.captured_at DESC LIMIT 1
        ),
        'mgi_state', (
          SELECT jsonb_build_object(
            'mgi_score', di.mgi_score,
            'mgi_velocity', d.latest_mgi_velocity,
            'captured_at', di.captured_at
          )
          FROM device_images di
          WHERE di.device_id = d.device_id
            AND di.mgi_score IS NOT NULL
            AND di.captured_at <= p_wake_round_end
          ORDER BY di.captured_at DESC LIMIT 1
        ),
        'display', jsonb_build_object(
          'color', CASE WHEN d.is_active THEN '#10B981' ELSE '#6B7280' END,
          'size', 'medium',
          'shape', 'circle'
        )
      )
    ) AS device_data
    FROM devices d
    WHERE d.site_id = v_site_id
      AND d.x_position IS NOT NULL
      AND d.y_position IS NOT NULL
  )

  SELECT jsonb_build_object(
    'devices', COALESCE((SELECT device_data FROM device_states), '[]'::jsonb),
    'wake_info', jsonb_build_object(
      'wake_number', p_wake_number,
      'wake_start', p_wake_round_start,
      'wake_end', p_wake_round_end
    ),
    'stats', jsonb_build_object(
      'active_devices', v_active_devices_count,
      'new_images', v_new_images_count,
      'new_alerts', v_new_alerts_count
    )
  ) INTO v_site_state;

  -- Calculate aggregates from device data
  WITH device_data AS (
    SELECT
      (d->>'battery_health_percent')::numeric as battery,
      (d->'telemetry'->>'temperature')::numeric as temp,
      (d->'telemetry'->>'humidity')::numeric as humidity,
      (d->'mgi_state'->>'mgi_score')::numeric as mgi
    FROM jsonb_array_elements(v_site_state->'devices') d
  )
  SELECT
    AVG(temp),
    AVG(humidity),
    AVG(mgi),
    MAX(mgi)
  INTO v_avg_temp, v_avg_humidity, v_avg_mgi, v_max_mgi
  FROM device_data;

  -- Insert or update snapshot
  INSERT INTO session_wake_snapshots (
    session_id, site_id, program_id, company_id,
    wake_number, wake_round_start, wake_round_end,
    site_state,
    active_devices_count, new_images_this_round, new_alerts_this_round,
    avg_temperature, avg_humidity, avg_mgi, max_mgi
  ) VALUES (
    p_session_id, v_site_id, v_program_id, v_company_id,
    p_wake_number, p_wake_round_start, p_wake_round_end,
    v_site_state,
    v_active_devices_count, v_new_images_count, v_new_alerts_count,
    v_avg_temperature, v_avg_humidity, v_avg_mgi, v_max_mgi
  )
  ON CONFLICT (session_id, wake_number)
  DO UPDATE SET
    site_state = EXCLUDED.site_state,
    active_devices_count = EXCLUDED.active_devices_count,
    new_images_this_round = EXCLUDED.new_images_this_round,
    new_alerts_this_round = EXCLUDED.new_alerts_this_round,
    avg_temperature = EXCLUDED.avg_temperature,
    avg_humidity = EXCLUDED.avg_humidity,
    avg_mgi = EXCLUDED.avg_mgi,
    max_mgi = EXCLUDED.max_mgi
  RETURNING snapshot_id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;
