/*
  # Fix Session Wake Snapshot Generation - Complete Rewrite
  
  Problem: Current function doesn't query device_wake_payloads properly
  Solution: Query device_wake_payloads + calculate velocities + pre-compute display colors
  
  Apply this to Supabase SQL Editor to fix snapshot generation
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
  v_previous_snapshot jsonb;
BEGIN
  -- Get session context
  SELECT site_id, program_id, company_id
  INTO v_site_id, v_program_id, v_company_id
  FROM site_device_sessions
  WHERE session_id = p_session_id;

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  -- Get previous snapshot for velocity calculations
  SELECT site_state INTO v_previous_snapshot
  FROM session_wake_snapshots
  WHERE session_id = p_session_id
    AND wake_number = p_wake_number - 1
  ORDER BY wake_number DESC
  LIMIT 1;

  -- Count active devices
  SELECT COUNT(*) INTO v_active_devices_count
  FROM devices
  WHERE site_id = v_site_id AND is_active = true;

  -- Count images in this window (from device_wake_payloads)
  SELECT COUNT(DISTINCT dwp.image_id) INTO v_new_images_count
  FROM device_wake_payloads dwp
  JOIN devices d ON d.device_id = dwp.device_id
  WHERE d.site_id = v_site_id
    AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
    AND dwp.image_id IS NOT NULL;

  -- Count alerts in this window
  SELECT COUNT(*) INTO v_new_alerts_count
  FROM device_alerts da
  JOIN devices d ON d.device_id = da.device_id
  WHERE d.site_id = v_site_id
    AND da.triggered_at BETWEEN p_wake_round_start AND p_wake_round_end;

  -- Build complete site state JSONB with per-device data from device_wake_payloads
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

  -- Per-device aggregation from device_wake_payloads in this window
  device_payloads AS (
    SELECT
      d.device_id,
      d.device_code,
      d.device_name,
      d.device_mac,
      d.x_position,
      d.y_position,
      d.zone_id,
      d.zone_label,
      d.is_active,
      d.battery_voltage,
      d.battery_health_percent,
      d.last_seen_at,

      -- Latest telemetry from payloads in this window
      (SELECT dwp.temperature FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_temperature,

      (SELECT dwp.humidity FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_humidity,

      (SELECT dwp.pressure FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_pressure,

      (SELECT dwp.battery_voltage FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_battery,

      (SELECT dwp.captured_at FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_captured_at,

      -- Average telemetry from all payloads in this window
      (SELECT AVG(dwp.temperature) FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
         AND dwp.temperature IS NOT NULL) as avg_temperature,

      (SELECT AVG(dwp.humidity) FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
         AND dwp.humidity IS NOT NULL) as avg_humidity,

      (SELECT AVG(dwp.pressure) FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
         AND dwp.pressure IS NOT NULL) as avg_pressure,

      -- Count payloads for this device in this window
      (SELECT COUNT(*) FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end) as payloads_count,

      -- Latest MGI from device_images (linked via device_wake_payloads)
      (SELECT di.mgi_score
       FROM device_images di
       JOIN device_wake_payloads dwp ON dwp.image_id = di.image_id
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
         AND di.mgi_score IS NOT NULL
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_mgi,

      -- Average MGI from all images in this window
      (SELECT AVG(di.mgi_score)
       FROM device_images di
       JOIN device_wake_payloads dwp ON dwp.image_id = di.image_id
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
         AND di.mgi_score IS NOT NULL) as avg_mgi,

      -- MGI timestamp
      (SELECT dwp.captured_at
       FROM device_images di
       JOIN device_wake_payloads dwp ON dwp.image_id = di.image_id
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
         AND di.mgi_score IS NOT NULL
       ORDER BY dwp.captured_at DESC LIMIT 1) as mgi_captured_at,

      -- Count images for this device in this window
      (SELECT COUNT(DISTINCT dwp.image_id)
       FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
         AND dwp.image_id IS NOT NULL) as images_count,

      -- Get previous snapshot data for this device (for velocity calculation)
      (SELECT device->'telemetry'->>'latest_temperature'
       FROM jsonb_array_elements(v_previous_snapshot->'devices') device
       WHERE (device->>'device_id')::uuid = d.device_id) as prev_temperature,

      (SELECT device->'telemetry'->>'latest_humidity'
       FROM jsonb_array_elements(v_previous_snapshot->'devices') device
       WHERE (device->>'device_id')::uuid = d.device_id) as prev_humidity,

      (SELECT device->'mgi_state'->>'latest_mgi_score'
       FROM jsonb_array_elements(v_previous_snapshot->'devices') device
       WHERE (device->>'device_id')::uuid = d.device_id) as prev_mgi,

      (SELECT device->'telemetry'->>'latest_battery'
       FROM jsonb_array_elements(v_previous_snapshot->'devices') device
       WHERE (device->>'device_id')::uuid = d.device_id) as prev_battery

    FROM devices d
    WHERE d.site_id = v_site_id
      AND d.is_active = true
  ),

  -- Build device states with calculated velocities
  device_states AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'device_id', dp.device_id,
        'device_code', dp.device_code,
        'device_name', dp.device_name,
        'device_mac', dp.device_mac,
        'position', jsonb_build_object('x', dp.x_position, 'y', dp.y_position),
        'zone_id', dp.zone_id,
        'zone_label', dp.zone_label,
        'status', CASE WHEN dp.is_active THEN 'active' ELSE 'inactive' END,
        'battery_voltage', dp.battery_voltage,
        'battery_health_percent', dp.battery_health_percent,
        'last_seen_at', dp.last_seen_at,

        -- Telemetry with velocities
        'telemetry', jsonb_build_object(
          'latest_temperature', dp.latest_temperature,
          'latest_humidity', dp.latest_humidity,
          'latest_pressure', dp.latest_pressure,
          'latest_battery', dp.latest_battery,
          'avg_temperature', ROUND(dp.avg_temperature, 2),
          'avg_humidity', ROUND(dp.avg_humidity, 2),
          'avg_pressure', ROUND(dp.avg_pressure, 2),
          'captured_at', dp.latest_captured_at,
          'payloads_count', dp.payloads_count,

          -- Calculate velocities (change from previous snapshot)
          'temp_velocity', CASE
            WHEN dp.prev_temperature IS NOT NULL AND dp.latest_temperature IS NOT NULL
            THEN ROUND(dp.latest_temperature - dp.prev_temperature::numeric, 2)
            ELSE NULL
          END,
          'humidity_velocity', CASE
            WHEN dp.prev_humidity IS NOT NULL AND dp.latest_humidity IS NOT NULL
            THEN ROUND(dp.latest_humidity - dp.prev_humidity::numeric, 2)
            ELSE NULL
          END,
          'battery_velocity', CASE
            WHEN dp.prev_battery IS NOT NULL AND dp.latest_battery IS NOT NULL
            THEN ROUND(dp.latest_battery - dp.prev_battery::numeric, 3)
            ELSE NULL
          END
        ),

        -- MGI state with velocity
        'mgi_state', jsonb_build_object(
          'latest_mgi_score', ROUND(dp.latest_mgi, 4),
          'avg_mgi_score', ROUND(dp.avg_mgi, 4),
          'images_count', dp.images_count,
          'scored_at', dp.mgi_captured_at,

          -- MGI velocity (change from previous snapshot)
          'mgi_velocity', CASE
            WHEN dp.prev_mgi IS NOT NULL AND dp.latest_mgi IS NOT NULL
            THEN ROUND(dp.latest_mgi - dp.prev_mgi::numeric, 4)
            ELSE NULL
          END,

          -- MGI speed per day (approximate)
          'mgi_speed_per_day', CASE
            WHEN dp.prev_mgi IS NOT NULL AND dp.latest_mgi IS NOT NULL
            THEN ROUND((dp.latest_mgi - dp.prev_mgi::numeric) * 8, 4)
            ELSE NULL
          END
        ),

        -- Images in this window
        'images_this_round', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'image_id', di.image_id,
              'image_url', di.image_url,
              'mgi_score', di.mgi_score,
              'captured_at', dwp.captured_at,
              'observation_type', di.observation_type
            )
          )
          FROM device_wake_payloads dwp
          JOIN device_images di ON di.image_id = dwp.image_id
          WHERE dwp.device_id = dp.device_id
            AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
        ),

        -- Active alerts
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
          WHERE da.device_id = dp.device_id
            AND da.is_acknowledged = false
        ),

        -- Display properties (calculated for UI)
        'display', jsonb_build_object(
          -- Dot color based on MGI score
          'dot_color', CASE
            WHEN dp.latest_mgi >= 0.6 THEN '#EF4444'
            WHEN dp.latest_mgi >= 0.4 THEN '#F59E0B'
            WHEN dp.latest_mgi IS NOT NULL THEN '#10B981'
            ELSE '#9CA3AF'
          END,

          -- Temperature zone color
          'temp_zone_color', CASE
            WHEN dp.latest_temperature >= 90 THEN '#EF4444'
            WHEN dp.latest_temperature >= 80 THEN '#F59E0B'
            WHEN dp.latest_temperature >= 70 THEN '#FCD34D'
            WHEN dp.latest_temperature >= 32 THEN '#E5E7EB'
            WHEN dp.latest_temperature IS NOT NULL THEN '#3B82F6'
            ELSE '#9CA3AF'
          END,

          -- Humidity zone color
          'humidity_zone_color', CASE
            WHEN dp.latest_humidity >= 85 THEN '#EF4444'
            WHEN dp.latest_humidity >= 75 THEN '#A855F7'
            WHEN dp.latest_humidity >= 60 THEN '#3B82F6'
            WHEN dp.latest_humidity >= 30 THEN '#10B981'
            WHEN dp.latest_humidity IS NOT NULL THEN '#92400E'
            ELSE '#9CA3AF'
          END,

          -- Battery floor color
          'battery_floor_color', CASE
            WHEN dp.latest_battery >= 3.8 THEN '#10B981'
            WHEN dp.latest_battery >= 3.6 THEN '#FCD34D'
            WHEN dp.latest_battery >= 3.4 THEN '#F59E0B'
            WHEN dp.latest_battery IS NOT NULL THEN '#EF4444'
            ELSE '#9CA3AF'
          END,

          -- Pulse animation (based on MGI velocity)
          'pulse_enabled', CASE
            WHEN dp.prev_mgi IS NOT NULL AND dp.latest_mgi IS NOT NULL
                 AND (dp.latest_mgi - dp.prev_mgi::numeric) > 0.01
            THEN true
            ELSE false
          END,
          'pulse_diameter', CASE
            WHEN dp.prev_mgi IS NOT NULL AND dp.latest_mgi IS NOT NULL THEN
              CASE
                WHEN (dp.latest_mgi - dp.prev_mgi::numeric) >= 0.05 THEN 60
                WHEN (dp.latest_mgi - dp.prev_mgi::numeric) >= 0.03 THEN 40
                ELSE 20
              END
            ELSE 0
          END,
          'pulse_color', CASE
            WHEN dp.latest_mgi >= 0.6 THEN '#EF4444'
            WHEN dp.latest_mgi >= 0.4 THEN '#F59E0B'
            ELSE '#10B981'
          END,

          'shape', 'circle',
          'size', 'medium',
          'opacity', 1.0
        )
      ) ORDER BY dp.device_code
    ) AS devices_array
    FROM device_payloads dp
  ),

  -- Environmental zones (device-centered)
  env_zones AS (
    SELECT generate_device_centered_zones(v_site_id) AS zones_array
  )

  -- Assemble final site_state
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

  -- Calculate site-level aggregate metrics
  SELECT
    AVG((device->'telemetry'->>'latest_temperature')::numeric),
    AVG((device->'telemetry'->>'latest_humidity')::numeric),
    AVG((device->'mgi_state'->>'latest_mgi_score')::numeric),
    MAX((device->'mgi_state'->>'latest_mgi_score')::numeric)
  INTO v_avg_temp, v_avg_humidity, v_avg_mgi, v_max_mgi
  FROM jsonb_array_elements(v_site_state->'devices') AS device;

  -- Insert or update snapshot
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
    max_mgi = EXCLUDED.max_mgi,
    created_at = now()
  RETURNING snapshot_id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;
