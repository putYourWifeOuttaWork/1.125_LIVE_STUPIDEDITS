-- Fix snapshot generation to use LATEST data AS OF wake time instead of data DURING wake window
-- This ensures snapshots show device state even when devices don't report during the exact wake window

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

  -- Count images in this round (still use DURING for new activity counts)
  SELECT COUNT(*) INTO v_new_images_count
  FROM device_images
  WHERE site_id = v_site_id
    AND captured_at BETWEEN p_wake_round_start AND p_wake_round_end;

  -- Count alerts in this round
  SELECT COUNT(*) INTO v_new_alerts_count
  FROM device_alerts
  WHERE site_id = v_site_id
    AND triggered_at BETWEEN p_wake_round_start AND p_wake_round_end;

  -- Build complete site state JSONB
  WITH
  -- Site metadata
  site_meta AS (
    SELECT jsonb_build_object(
      'site_id', s.site_id,
      'site_name', s.name,
      'site_code', s.site_code,
      'site_type', s.type,
      'dimensions', jsonb_build_object(
        'length', s.length,
        'width', s.width,
        'height', s.height
      ),
      'wall_details', COALESCE(s.wall_details, '[]'::jsonb),
      'door_details', COALESCE(s.door_details, '[]'::jsonb),
      'platform_details', COALESCE(s.platform_details, '[]'::jsonb),
      'timezone', s.timezone
    ) AS site_metadata
    FROM sites s WHERE s.site_id = v_site_id
  ),

  -- Program context
  program_meta AS (
    SELECT jsonb_build_object(
      'program_id', pp.program_id,
      'program_name', pp.name,
      'program_start_date', pp.start_date,
      'program_end_date', pp.end_date,
      'program_day', DATE_PART('day', p_wake_round_end - pp.start_date)::integer,
      'total_days', DATE_PART('day', pp.end_date - pp.start_date)::integer
    ) AS program_context
    FROM pilot_programs pp WHERE pp.program_id = v_program_id
  ),

  -- Device states with MGI metrics (CHANGED: Use LATEST data AS OF wake_round_end)
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
            AND dt.captured_at <= p_wake_round_end  -- CHANGED: Latest AS OF wake end
          ORDER BY dt.captured_at DESC LIMIT 1
        ),
        'mgi_state', (
          SELECT calculate_mgi_metrics(
            d.device_id,
            di.mgi_score,
            di.captured_at
          )
          FROM device_images di
          WHERE di.device_id = d.device_id
            AND di.mgi_score IS NOT NULL
            AND di.captured_at <= p_wake_round_end  -- CHANGED: Latest AS OF wake end
          ORDER BY di.captured_at DESC LIMIT 1
        ),
        'images_this_round', (
          SELECT COUNT(*)
          FROM device_images di2
          WHERE di2.device_id = d.device_id
            AND di2.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
        ),
        'alerts', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'alert_id', da.alert_id,
              'alert_type', da.alert_type,
              'severity', da.severity,
              'message', da.message,
              'triggered_at', da.triggered_at
            ) ORDER BY da.triggered_at DESC
          ), '[]'::jsonb)
          FROM device_alerts da
          WHERE da.device_id = d.device_id
            AND da.triggered_at BETWEEN p_wake_round_start AND p_wake_round_end
        ),
        'display', jsonb_build_object(
          'color', CASE
            WHEN d.is_active THEN '#10B981'
            ELSE '#6B7280'
          END,
          'size', CASE
            WHEN d.battery_health_percent < 20 THEN 'small'
            WHEN d.battery_health_percent > 80 THEN 'large'
            ELSE 'medium'
          END,
          'shape', 'circle'
        )
      )
    ) AS device_data
    FROM devices d
    WHERE d.site_id = v_site_id
      AND d.x_position IS NOT NULL
      AND d.y_position IS NOT NULL
  )

  -- Continue with rest of snapshot generation (zones, summaries, etc.)
  SELECT jsonb_build_object(
    'metadata', (SELECT site_metadata FROM site_meta),
    'program', (SELECT program_context FROM program_meta),
    'devices', COALESCE((SELECT device_data FROM device_states), '[]'::jsonb),
    'wake_info', jsonb_build_object(
      'wake_number', p_wake_number,
      'wake_start', p_wake_round_start,
      'wake_end', p_wake_round_end,
      'duration_hours', EXTRACT(EPOCH FROM (p_wake_round_end - p_wake_round_start)) / 3600
    ),
    'stats', jsonb_build_object(
      'active_devices', v_active_devices_count,
      'new_images', v_new_images_count,
      'new_alerts', v_new_alerts_count
    )
  ) INTO v_site_state;

  -- Calculate aggregate metrics from devices for quick access
  SELECT
    AVG((d->>'battery_health_percent')::numeric),
    AVG(CASE WHEN d->'telemetry' IS NOT NULL THEN (d->'telemetry'->>'temperature')::numeric END),
    AVG(CASE WHEN d->'telemetry' IS NOT NULL THEN (d->'telemetry'->>'humidity')::numeric END),
    AVG(CASE WHEN d->'mgi_state' IS NOT NULL THEN (d->'mgi_state'->>'mgi_score')::numeric END),
    MAX(CASE WHEN d->'mgi_state' IS NOT NULL THEN (d->'mgi_state'->>'mgi_score')::numeric END)
  INTO v_avg_temp, v_avg_humidity, v_avg_temp, v_avg_mgi, v_max_mgi
  FROM jsonb_array_elements(v_site_state->'devices') d;

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

COMMENT ON FUNCTION generate_session_wake_snapshot IS 'Generate snapshot using LATEST device data AS OF wake time (not during wake window). This ensures complete visualization even when devices report asynchronously.';
