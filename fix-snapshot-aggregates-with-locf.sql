/*
  # Fix Snapshot Aggregates Using LOCF and Actual Data

  ## Problem
  - Snapshots use 1-hour windows (00:00-01:00, 01:00-02:00, etc.)
  - Device wakes happen at specific times (01:05, 02:37, 03:37, etc.)
  - Temperature/humidity only exists for hour 1 wakes (01:05-01:43)
  - Later wakes have images but no telemetry records

  ## Solution
  - Use LOCF (Last Observation Carried Forward) for environmental data
  - Query MGI from device_images within the hour window
  - For temp/humidity, use the most recent value from ANY previous time

  ## Implementation
  - Update generate_session_wake_snapshot function to use LOCF
  - Backfill existing NULL snapshots with LOCF data
*/

-- =====================================================
-- STEP 1: Update generate_session_wake_snapshot Function
-- =====================================================

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
            'temperature', COALESCE(
              -- First try: telemetry in this wake window
              (SELECT temperature FROM device_telemetry dt1
               WHERE dt1.device_id = d.device_id
               AND dt1.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
               ORDER BY dt1.captured_at DESC LIMIT 1),
              -- LOCF: Most recent telemetry BEFORE this window
              (SELECT temperature FROM device_telemetry dt2
               WHERE dt2.device_id = d.device_id
               AND dt2.captured_at < p_wake_round_end
               ORDER BY dt2.captured_at DESC LIMIT 1)
            ),
            'humidity', COALESCE(
              -- First try: telemetry in this wake window
              (SELECT humidity FROM device_telemetry dt1
               WHERE dt1.device_id = d.device_id
               AND dt1.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
               ORDER BY dt1.captured_at DESC LIMIT 1),
              -- LOCF: Most recent telemetry BEFORE this window
              (SELECT humidity FROM device_telemetry dt2
               WHERE dt2.device_id = d.device_id
               AND dt2.captured_at < p_wake_round_end
               ORDER BY dt2.captured_at DESC LIMIT 1)
            ),
            'pressure', (SELECT pressure FROM device_telemetry dt WHERE dt.device_id = d.device_id AND dt.captured_at <= p_wake_round_end ORDER BY dt.captured_at DESC LIMIT 1),
            'gas_resistance', (SELECT gas_resistance FROM device_telemetry dt WHERE dt.device_id = d.device_id AND dt.captured_at <= p_wake_round_end ORDER BY dt.captured_at DESC LIMIT 1),
            'wifi_rssi', (SELECT wifi_rssi FROM device_telemetry dt WHERE dt.device_id = d.device_id AND dt.captured_at <= p_wake_round_end ORDER BY dt.captured_at DESC LIMIT 1),
            'captured_at', (SELECT captured_at FROM device_telemetry dt WHERE dt.device_id = d.device_id AND dt.captured_at <= p_wake_round_end ORDER BY dt.captured_at DESC LIMIT 1)
          )
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
              'threshold_value', threshold_value,
              'actual_value', actual_value,
              'triggered_at', triggered_at
            )
          )
          FROM device_alerts da
          WHERE da.device_id = d.device_id
            AND da.is_acknowledged = false
        ),
        'display', jsonb_build_object(
          'color', CASE
            WHEN (SELECT mgi_score FROM device_images WHERE device_id = d.device_id AND mgi_score IS NOT NULL ORDER BY captured_at DESC LIMIT 1) >= 8 THEN '#DC2626'  -- Critical: red
            WHEN (SELECT mgi_score FROM device_images WHERE device_id = d.device_id AND mgi_score IS NOT NULL ORDER BY captured_at DESC LIMIT 1) >= 5 THEN '#F59E0B'  -- Warning: orange
            WHEN (SELECT mgi_score FROM device_images WHERE device_id = d.device_id AND mgi_score IS NOT NULL ORDER BY captured_at DESC LIMIT 1) >= 3 THEN '#FCD34D'  -- Caution: yellow
            ELSE '#10B981'  -- Good: green
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

  -- Calculate aggregate metrics WITH LOCF
  SELECT
    AVG((telemetry->>'temperature')::numeric),
    AVG((telemetry->>'humidity')::numeric),
    AVG((mgi_state->>'current_mgi')::numeric),
    MAX((mgi_state->>'current_mgi')::numeric)
  INTO v_avg_temp, v_avg_humidity, v_avg_mgi, v_max_mgi
  FROM jsonb_array_elements(v_site_state->'devices') AS device
  CROSS JOIN LATERAL jsonb_to_record(device) AS x(telemetry jsonb, mgi_state jsonb)
  WHERE telemetry->>'temperature' IS NOT NULL OR mgi_state->>'current_mgi' IS NOT NULL;

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
  ON CONFLICT (session_id, wake_number) DO UPDATE SET
    site_state = EXCLUDED.site_state,
    avg_temperature = EXCLUDED.avg_temperature,
    avg_humidity = EXCLUDED.avg_humidity,
    avg_mgi = EXCLUDED.avg_mgi,
    max_mgi = EXCLUDED.max_mgi
  RETURNING snapshot_id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

COMMENT ON FUNCTION generate_session_wake_snapshot IS 'Generate complete JSONB snapshot of site state after wake round completes. Uses LOCF for environmental data when telemetry is missing.';

-- =====================================================
-- STEP 2: Backfill Existing Snapshots with LOCF Data
-- =====================================================

DO $$
DECLARE
  v_snapshot RECORD;
  v_result uuid;
BEGIN
  FOR v_snapshot IN
    SELECT session_id, wake_number, wake_round_start, wake_round_end
    FROM session_wake_snapshots
    WHERE avg_temperature IS NULL OR avg_humidity IS NULL
    ORDER BY wake_round_start
  LOOP
    -- Regenerate snapshot with LOCF
    v_result := generate_session_wake_snapshot(
      v_snapshot.session_id,
      v_snapshot.wake_number,
      v_snapshot.wake_round_start,
      v_snapshot.wake_round_end
    );

    RAISE NOTICE 'Regenerated snapshot for session % wake %', v_snapshot.session_id, v_snapshot.wake_number;
  END LOOP;
END $$;
