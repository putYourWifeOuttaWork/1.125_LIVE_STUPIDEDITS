-- Drop and recreate the function to force refresh
DROP FUNCTION IF EXISTS generate_session_wake_snapshot(uuid, integer, timestamptz, timestamptz);

-- Now recreate with the fixed EPOCH version
-- =====================================================================
-- UPDATE ONLY: generate_session_wake_snapshot with EPOCH fix
-- =====================================================================
-- This replaces the existing function with the corrected version
-- Apply this in Supabase SQL Editor
-- =====================================================================

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

  -- Count images/alerts in this round
  SELECT COUNT(*) INTO v_new_images_count
  FROM device_images
  WHERE site_id = v_site_id
    AND captured_at BETWEEN p_wake_round_start AND p_wake_round_end;

  SELECT COUNT(*) INTO v_new_alerts_count
  FROM device_alerts
  WHERE site_id = v_site_id
    AND triggered_at BETWEEN p_wake_round_start AND p_wake_round_end;

  -- Build site state with connectivity metadata
  WITH
  site_meta AS (
    SELECT jsonb_build_object(
      'site_id', s.site_id,
      'site_name', s.name,
      'site_code', s.site_code,
      'site_type', s.type,
      'dimensions', jsonb_build_object('length', s.length, 'width', s.width, 'height', s.height),
      'wall_details', COALESCE(s.wall_details, '[]'::jsonb),
      'door_details', COALESCE(s.door_details, '[]'::jsonb),
      'platform_details', COALESCE(s.platform_details, '[]'::jsonb),
      'timezone', s.timezone
    ) AS site_metadata
    FROM sites s WHERE s.site_id = v_site_id
  ),
  program_meta AS (
    SELECT jsonb_build_object(
      'program_id', pp.program_id,
      'program_name', pp.name,
      'program_start_date', pp.start_date,
      'program_end_date', pp.end_date,
      'program_day', (EXTRACT(EPOCH FROM (p_wake_round_end - pp.start_date)) / 86400)::integer,
      'total_days', (EXTRACT(EPOCH FROM (pp.end_date - pp.start_date)) / 86400)::integer
    ) AS program_context
    FROM pilot_programs pp WHERE pp.program_id = v_program_id
  ),
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
        'connectivity', calculate_device_wake_reliability(d.device_id, v_site_id, p_wake_round_end, 3),
        'telemetry', (
          SELECT jsonb_build_object(
            'latest_temperature', temperature,
            'latest_humidity', humidity,
            'latest_pressure', pressure,
            'latest_gas_resistance', gas_resistance,
            'latest_wifi_rssi', wifi_rssi,
            'captured_at', captured_at
          )
          FROM device_telemetry dt
          WHERE dt.device_id = d.device_id AND dt.site_id = v_site_id
            AND dt.captured_at <= p_wake_round_end
          ORDER BY dt.captured_at DESC LIMIT 1
        ),
        'mgi_state', (
          SELECT calculate_mgi_metrics(d.device_id, di.mgi_score, di.captured_at)
          FROM device_images di
          WHERE di.device_id = d.device_id AND di.site_id = v_site_id
            AND di.mgi_score IS NOT NULL AND di.captured_at <= p_wake_round_end
          ORDER BY di.captured_at DESC LIMIT 1
        ),
        'images_this_round', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'image_id', image_id,
              'image_url', image_url,
              'mgi_score', mgi_score,
              'captured_at', captured_at
            ) ORDER BY captured_at DESC
          )
          FROM device_images di2
          WHERE di2.device_id = d.device_id
            AND di2.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
        ),
        'alerts', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'alert_id', alert_id,
              'alert_type', alert_type,
              'severity', severity,
              'triggered_at', triggered_at,
              'message', message
            ) ORDER BY triggered_at DESC
          )
          FROM device_alerts da
          WHERE da.device_id = d.device_id
            AND da.triggered_at BETWEEN p_wake_round_start AND p_wake_round_end
        ),
        'display', jsonb_build_object(
          'color', COALESCE(
            (SELECT CASE
                WHEN mgi >= 75 THEN '#EF4444'
                WHEN mgi >= 50 THEN '#F59E0B'
                WHEN mgi >= 25 THEN '#EAB308'
                ELSE '#10B981'
              END
            FROM (SELECT di.mgi_score as mgi FROM device_images di
                  WHERE di.device_id = d.device_id AND di.site_id = v_site_id
                    AND di.mgi_score IS NOT NULL AND di.captured_at <= p_wake_round_end
                  ORDER BY di.captured_at DESC LIMIT 1) mgi_data),
            (SELECT CASE
                WHEN temp >= 30 THEN '#EF4444'
                WHEN temp >= 25 THEN '#F59E0B'
                WHEN temp >= 20 THEN '#EAB308'
                ELSE '#10B981'
              END
            FROM (SELECT dt.temperature as temp FROM device_telemetry dt
                  WHERE dt.device_id = d.device_id AND dt.site_id = v_site_id
                    AND dt.captured_at <= p_wake_round_end
                  ORDER BY dt.captured_at DESC LIMIT 1) temp_data),
            '#6B7280'
          ),
          'shape', 'circle',
          'size', 'medium'
        )
      ) ORDER BY d.device_code
    ) AS devices_array
    FROM devices d
    WHERE d.site_id = v_site_id AND d.is_active = true
  ),
  env_zones AS (
    SELECT generate_device_centered_zones(v_site_id) AS zones_array
  )
  SELECT jsonb_build_object(
    'snapshot_metadata', jsonb_build_object(
      'wake_number', p_wake_number,
      'wake_round_start', p_wake_round_start,
      'wake_round_end', p_wake_round_end,
      'session_id', p_session_id
    ),
    'site_metadata', (SELECT site_metadata FROM site_meta),
    'program_context', (SELECT program_context FROM program_meta),
    'devices', COALESCE((SELECT devices_array FROM device_states), '[]'::jsonb),
    'environmental_zones', COALESCE((SELECT zones_array FROM env_zones), '[]'::jsonb),
    'session_metrics', jsonb_build_object(
      'active_devices_count', v_active_devices_count,
      'new_images_this_round', v_new_images_count,
      'new_alerts_this_round', v_new_alerts_count
    )
  ) INTO v_site_state;

  -- Calculate aggregate metrics
  SELECT
    AVG((telemetry->>'latest_temperature')::numeric),
    AVG((telemetry->>'latest_humidity')::numeric),
    AVG((mgi_state->>'latest_mgi_score')::numeric),
    MAX((mgi_state->>'latest_mgi_score')::numeric)
  INTO v_avg_temp, v_avg_humidity, v_avg_mgi, v_max_mgi
  FROM jsonb_array_elements(v_site_state->'devices') AS device
  CROSS JOIN LATERAL jsonb_to_record(device) AS x(telemetry jsonb, mgi_state jsonb);

  -- Insert or update snapshot
  INSERT INTO session_wake_snapshots (
    company_id, program_id, site_id, session_id,
    wake_number, wake_round_start, wake_round_end,
    site_state,
    active_devices_count, new_images_this_round, new_alerts_this_round,
    avg_temperature, avg_humidity, avg_mgi, max_mgi
  )
  VALUES (
    v_company_id, v_program_id, v_site_id, p_session_id,
    p_wake_number, p_wake_round_start, p_wake_round_end,
    v_site_state,
    v_active_devices_count, v_new_images_count, v_new_alerts_count,
    v_avg_temp, v_avg_humidity, v_avg_mgi, v_max_mgi
  )
  ON CONFLICT (session_id, wake_number) DO UPDATE SET
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

COMMENT ON FUNCTION generate_session_wake_snapshot IS 'Generate snapshot with connectivity metadata showing device wake reliability';
