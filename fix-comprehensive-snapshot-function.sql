/*
  # Fix Comprehensive Snapshot Generation Function

  ## Problem
  Current snapshot function creates incomplete site_state structure missing:
  - site_metadata (dimensions, walls, doors)
  - program_context
  - environmental_zones
  - snapshot_metadata
  - session_metrics wrapper

  ## Solution
  Replace with comprehensive version that includes all metadata needed for
  map visualization while using device_wake_payloads for telemetry data.

  ## Changes
  - Restore full site_state structure
  - Use device_wake_payloads instead of device_telemetry
  - Include LOCF (Last Observation Carried Forward) logic
  - Add environmental zones
  - Include complete site and program metadata
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

  -- Device states with telemetry from wake_payloads (with LOCF)
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

        -- Telemetry from wake_payloads with LOCF fallback
        'telemetry', (
          SELECT COALESCE(
            -- Try current wake round first
            (SELECT jsonb_build_object(
                'temperature', wp.temperature,
                'humidity', wp.humidity,
                'pressure', wp.pressure,
                'wifi_rssi', wp.wifi_rssi,
                'captured_at', wp.captured_at,
                'is_current', true,
                'data_freshness', 'current_wake'
              )
             FROM device_wake_payloads wp
             WHERE wp.device_id = d.device_id
               AND wp.site_device_session_id = p_session_id
               AND wp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
             ORDER BY wp.captured_at DESC LIMIT 1
            ),
            -- Fallback to previous wake payload (LOCF)
            (SELECT jsonb_build_object(
                'temperature', wp.temperature,
                'humidity', wp.humidity,
                'pressure', wp.pressure,
                'wifi_rssi', wp.wifi_rssi,
                'captured_at', wp.captured_at,
                'is_current', false,
                'data_freshness', 'carried_forward',
                'hours_since_last', ROUND(EXTRACT(EPOCH FROM (p_wake_round_end - wp.captured_at)) / 3600, 2)
              )
             FROM device_wake_payloads wp
             WHERE wp.device_id = d.device_id
               AND wp.site_device_session_id = p_session_id
               AND wp.captured_at < p_wake_round_start
             ORDER BY wp.captured_at DESC LIMIT 1
            )
          )
        ),

        -- MGI state with LOCF fallback
        'mgi_state', (
          SELECT COALESCE(
            -- Try current wake round first
            (SELECT calculate_mgi_metrics(d.device_id, di.mgi_score, di.captured_at)
             FROM device_images di
             WHERE di.device_id = d.device_id
               AND di.mgi_score IS NOT NULL
               AND di.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
             ORDER BY di.captured_at DESC LIMIT 1
            ),
            -- Fallback to previous image (LOCF)
            (SELECT jsonb_build_object(
                'current_mgi', di.mgi_score,
                'captured_at', di.captured_at,
                'is_current', false,
                'data_freshness', 'carried_forward',
                'hours_since_last', ROUND(EXTRACT(EPOCH FROM (p_wake_round_end - di.captured_at)) / 3600, 2)
              )
             FROM device_images di
             WHERE di.device_id = d.device_id
               AND di.mgi_score IS NOT NULL
               AND di.captured_at < p_wake_round_start
             ORDER BY di.captured_at DESC LIMIT 1
            )
          )
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
              'threshold_value', threshold_value,
              'actual_value', actual_value,
              'triggered_at', triggered_at
            )
          )
          FROM device_alerts da
          WHERE da.device_id = d.device_id
            AND da.triggered_at BETWEEN p_wake_round_start AND p_wake_round_end
            AND da.is_acknowledged = false
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

  -- Environmental zones (device-centered)
  env_zones AS (
    SELECT generate_device_centered_zones(v_site_id) AS zones_array
  )

  -- Assemble final site_state with complete structure
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

  -- Calculate aggregate metrics from devices
  SELECT
    AVG((telemetry->>'temperature')::numeric),
    AVG((telemetry->>'humidity')::numeric),
    AVG((mgi_state->>'current_mgi')::numeric),
    MAX((mgi_state->>'current_mgi')::numeric)
  INTO v_avg_temp, v_avg_humidity, v_avg_mgi, v_max_mgi
  FROM jsonb_array_elements(v_site_state->'devices') AS device
  CROSS JOIN LATERAL jsonb_to_record(device) AS x(telemetry jsonb, mgi_state jsonb);

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

COMMENT ON FUNCTION generate_session_wake_snapshot IS 'Generate complete JSONB snapshot with full site metadata, zones, and device states using wake_payloads. Includes LOCF for missed wakes.';
