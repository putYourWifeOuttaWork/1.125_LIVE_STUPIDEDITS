-- Fix generate_session_wake_snapshot function
-- Issues fixed:
-- 1. DATE_PART: date - date returns integer, not interval
-- 2. device_alerts: removed threshold_value/actual_value (don't exist)
-- 3. device_alerts: use resolved_at IS NULL instead of is_acknowledged

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

  -- Program context (FIX: date - date returns integer days, not interval)
  program_meta AS (
    SELECT jsonb_build_object(
      'program_id', pp.program_id,
      'program_name', pp.name,
      'program_start_date', pp.start_date,
      'program_end_date', pp.end_date,
      'program_day', (p_wake_round_end::date - pp.start_date),
      'total_days', (pp.end_date - pp.start_date)
    ) AS program_context
    FROM pilot_programs pp WHERE pp.program_id = v_program_id
  ),

  -- Device states with MGI metrics
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
            AND dt.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
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
            AND di.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
          ORDER BY di.captured_at DESC LIMIT 1
        ),
        'images_this_round', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'image_id', image_id,
              'image_url', image_url,
              'mgi_score', mgi_score,
              'captured_at', captured_at,
              'observation_type', observation_type
            )
          )
          FROM device_images di
          WHERE di.device_id = d.device_id
            AND di.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
        ),
        'alerts', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'alert_id', alert_id,
              'alert_type', alert_type,
              'severity', severity,
              'message', message,
              'triggered_at', triggered_at
            )
          )
          FROM device_alerts da
          WHERE da.device_id = d.device_id
            AND da.resolved_at IS NULL
        ),
        'display', jsonb_build_object(
          'color', CASE
            WHEN (SELECT mgi_score FROM device_images WHERE device_id = d.device_id AND mgi_score IS NOT NULL ORDER BY captured_at DESC LIMIT 1) >= 8 THEN '#DC2626'
            WHEN (SELECT mgi_score FROM device_images WHERE device_id = d.device_id AND mgi_score IS NOT NULL ORDER BY captured_at DESC LIMIT 1) >= 5 THEN '#F59E0B'
            WHEN (SELECT mgi_score FROM device_images WHERE device_id = d.device_id AND mgi_score IS NOT NULL ORDER BY captured_at DESC LIMIT 1) >= 3 THEN '#FCD34D'
            ELSE '#10B981'
          END,
          'shape', 'circle',
          'size', 'medium'
        )
      ) ORDER BY d.device_code
    ) AS devices_array
    FROM devices d
    WHERE d.site_id = v_site_id AND d.is_active = true
  ),

  -- Zone information (device-centered environmental zones)
  zone_states AS (
    SELECT generate_device_centered_zones(v_site_id, 15.0) AS zones_array
  ),

  -- Environmental aggregates per zone
  zone_environment AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'zone_id', d.zone_id,
        'zone_label', d.zone_label,
        'avg_temperature', AVG(dt.temperature),
        'avg_humidity', AVG(dt.humidity),
        'avg_pressure', AVG(dt.pressure),
        'device_count', COUNT(DISTINCT d.device_id)
      )
    ) AS zone_environment_data
    FROM devices d
    LEFT JOIN device_telemetry dt ON dt.device_id = d.device_id
      AND dt.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
    WHERE d.site_id = v_site_id AND d.is_active = true
    GROUP BY d.zone_id, d.zone_label
  ),

  -- MGI aggregates
  mgi_aggregates AS (
    SELECT
      AVG(di.mgi_score) AS avg_mgi,
      MAX(di.mgi_score) AS max_mgi,
      MIN(di.mgi_score) AS min_mgi,
      COUNT(*) AS devices_with_mgi
    FROM device_images di
    JOIN devices d ON d.device_id = di.device_id
    WHERE d.site_id = v_site_id
      AND d.is_active = true
      AND di.mgi_score IS NOT NULL
      AND di.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
  ),

  -- Environmental aggregates
  env_aggregates AS (
    SELECT
      AVG(dt.temperature) AS avg_temp,
      AVG(dt.humidity) AS avg_humidity,
      AVG(dt.pressure) AS avg_pressure
    FROM device_telemetry dt
    JOIN devices d ON d.device_id = dt.device_id
    WHERE d.site_id = v_site_id
      AND d.is_active = true
      AND dt.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
  )

  -- Combine everything into site_state JSONB
  SELECT jsonb_build_object(
    'metadata', site_meta.site_metadata,
    'program', program_meta.program_context,
    'wake_info', jsonb_build_object(
      'wake_number', p_wake_number,
      'wake_start', p_wake_round_start,
      'wake_end', p_wake_round_end
    ),
    'devices', COALESCE(device_states.devices_array, '[]'::jsonb),
    'zones', COALESCE(zone_states.zones_array, '[]'::jsonb),
    'zone_environment', COALESCE(zone_environment.zone_environment_data, '[]'::jsonb),
    'mgi_summary', jsonb_build_object(
      'avg_mgi', ROUND(COALESCE(mgi_aggregates.avg_mgi, 0), 2),
      'max_mgi', ROUND(COALESCE(mgi_aggregates.max_mgi, 0), 2),
      'min_mgi', ROUND(COALESCE(mgi_aggregates.min_mgi, 0), 2),
      'devices_with_mgi', COALESCE(mgi_aggregates.devices_with_mgi, 0)
    ),
    'environment_summary', jsonb_build_object(
      'avg_temperature', ROUND(COALESCE(env_aggregates.avg_temp, 0), 2),
      'avg_humidity', ROUND(COALESCE(env_aggregates.avg_humidity, 0), 2),
      'avg_pressure', ROUND(COALESCE(env_aggregates.avg_pressure, 0), 2)
    ),
    'stats', jsonb_build_object(
      'active_devices', v_active_devices_count,
      'new_images', v_new_images_count,
      'new_alerts', v_new_alerts_count
    )
  )
  INTO v_site_state
  FROM site_meta, program_meta, device_states, zone_states, zone_environment, mgi_aggregates, env_aggregates;

  -- Store aggregates
  SELECT avg_mgi, max_mgi INTO v_avg_mgi, v_max_mgi FROM mgi_aggregates;
  SELECT avg_temp, avg_humidity INTO v_avg_temp, v_avg_humidity FROM env_aggregates;

  -- Insert snapshot
  INSERT INTO session_wake_snapshots (
    company_id,
    program_id,
    site_id,
    session_id,
    wake_number,
    wake_round_start,
    wake_round_end,
    site_state,
    active_devices_count,
    new_images_this_round,
    new_alerts_this_round,
    avg_temperature,
    avg_humidity,
    avg_mgi,
    max_mgi
  ) VALUES (
    v_company_id,
    v_program_id,
    v_site_id,
    p_session_id,
    p_wake_number,
    p_wake_round_start,
    p_wake_round_end,
    v_site_state,
    v_active_devices_count,
    v_new_images_count,
    v_new_alerts_count,
    v_avg_temp,
    v_avg_humidity,
    v_avg_mgi,
    v_max_mgi
  )
  RETURNING snapshot_id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

COMMENT ON FUNCTION generate_session_wake_snapshot IS 'Generate complete JSONB snapshot of site state after wake round completes. Includes all devices, MGI metrics, telemetry, zones, and alerts. Fixed to use correct device_alerts columns.';
