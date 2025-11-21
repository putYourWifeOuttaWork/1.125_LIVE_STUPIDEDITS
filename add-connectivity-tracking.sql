/*
  # Add Device Wake Reliability Tracking

  1. Function: calculate_device_wake_reliability
     - Looks back at last 3 expected wake times based on cron schedule
     - Compares with actual device activity (last_seen_at, telemetry, images)
     - Returns connectivity status: green (3/3), yellow (2/3), red (≤1/3)

  2. Updates snapshot generation to include connectivity metadata
*/

-- Function to parse cron and get previous N expected wake times
CREATE OR REPLACE FUNCTION get_previous_wake_times(
  p_cron_schedule text,
  p_reference_time timestamptz,
  p_count integer DEFAULT 3
)
RETURNS timestamptz[]
LANGUAGE plpgsql
AS $$
DECLARE
  v_wake_times timestamptz[] := '{}';
  v_current_time timestamptz := p_reference_time;
  v_interval interval;
  i integer;
BEGIN
  -- Handle null or empty cron
  IF p_cron_schedule IS NULL OR p_cron_schedule = '' THEN
    RETURN v_wake_times;
  END IF;

  -- Parse common cron patterns for hourly intervals
  -- Pattern: "0 */N * * *" means every N hours
  IF p_cron_schedule ~ '^0 \*/(\d+) \* \* \*$' THEN
    v_interval := (regexp_replace(p_cron_schedule, '^0 \*/(\d+) \* \* \*$', '\1') || ' hours')::interval;
    
    FOR i IN 1..p_count LOOP
      v_current_time := v_current_time - v_interval;
      v_wake_times := array_append(v_wake_times, v_current_time);
    END LOOP;
    
    RETURN v_wake_times;
  END IF;

  -- Pattern: "0 H1,H2,H3 * * *" means specific hours daily
  -- For simplicity, estimate based on number of hours listed
  IF p_cron_schedule ~ '^0 \d+(,\d+)* \* \* \*$' THEN
    -- Count number of wake times per day
    v_interval := '24 hours'::interval / (array_length(string_to_array(regexp_replace(p_cron_schedule, '^0 ([\d,]+) \* \* \*$', '\1'), ','), 1));
    
    FOR i IN 1..p_count LOOP
      v_current_time := v_current_time - v_interval;
      v_wake_times := array_append(v_wake_times, v_current_time);
    END LOOP;
    
    RETURN v_wake_times;
  END IF;

  -- Default: assume hourly for unknown patterns
  v_interval := '1 hour'::interval;
  FOR i IN 1..p_count LOOP
    v_current_time := v_current_time - v_interval;
    v_wake_times := array_append(v_wake_times, v_current_time);
  END LOOP;

  RETURN v_wake_times;
END;
$$;

-- Function to check if device was active near a specific time
CREATE OR REPLACE FUNCTION was_device_active_near(
  p_device_id uuid,
  p_site_id uuid,
  p_expected_time timestamptz,
  p_tolerance_minutes integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_activity boolean := false;
BEGIN
  -- Check device last_seen_at
  SELECT EXISTS(
    SELECT 1 FROM devices
    WHERE device_id = p_device_id
      AND last_seen_at IS NOT NULL
      AND last_seen_at BETWEEN (p_expected_time - (p_tolerance_minutes || ' minutes')::interval)
                           AND (p_expected_time + (p_tolerance_minutes || ' minutes')::interval)
  ) INTO v_has_activity;
  
  IF v_has_activity THEN
    RETURN true;
  END IF;

  -- Check telemetry
  SELECT EXISTS(
    SELECT 1 FROM device_telemetry
    WHERE device_id = p_device_id
      AND site_id = p_site_id
      AND captured_at BETWEEN (p_expected_time - (p_tolerance_minutes || ' minutes')::interval)
                          AND (p_expected_time + (p_tolerance_minutes || ' minutes')::interval)
  ) INTO v_has_activity;
  
  IF v_has_activity THEN
    RETURN true;
  END IF;

  -- Check images
  SELECT EXISTS(
    SELECT 1 FROM device_images
    WHERE device_id = p_device_id
      AND site_id = p_site_id
      AND captured_at BETWEEN (p_expected_time - (p_tolerance_minutes || ' minutes')::interval)
                          AND (p_expected_time + (p_tolerance_minutes || ' minutes')::interval)
  ) INTO v_has_activity;

  RETURN v_has_activity;
END;
$$;

-- Main function to calculate wake reliability
CREATE OR REPLACE FUNCTION calculate_device_wake_reliability(
  p_device_id uuid,
  p_site_id uuid,
  p_reference_time timestamptz,
  p_trailing_count integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_cron_schedule text;
  v_expected_wake_times timestamptz[];
  v_successful_wakes integer := 0;
  v_expected_wakes integer := 0;
  v_reliability_percent numeric;
  v_status text;
  v_color text;
  expected_time timestamptz;
BEGIN
  -- Get device wake schedule
  SELECT wake_schedule_cron INTO v_cron_schedule
  FROM devices
  WHERE device_id = p_device_id;

  -- If no schedule, return null connectivity
  IF v_cron_schedule IS NULL OR v_cron_schedule = '' THEN
    RETURN jsonb_build_object(
      'status', 'unknown',
      'color', '#9CA3AF',
      'trailing_wakes_expected', 0,
      'trailing_wakes_actual', 0,
      'reliability_percent', null,
      'last_expected_wakes', '[]'::jsonb
    );
  END IF;

  -- Get previous expected wake times
  v_expected_wake_times := get_previous_wake_times(v_cron_schedule, p_reference_time, p_trailing_count);
  v_expected_wakes := array_length(v_expected_wake_times, 1);

  -- Check each expected wake time
  FOREACH expected_time IN ARRAY v_expected_wake_times
  LOOP
    IF was_device_active_near(p_device_id, p_site_id, expected_time, 30) THEN
      v_successful_wakes := v_successful_wakes + 1;
    END IF;
  END LOOP;

  -- Calculate reliability
  IF v_expected_wakes > 0 THEN
    v_reliability_percent := (v_successful_wakes::numeric / v_expected_wakes::numeric) * 100;
  ELSE
    v_reliability_percent := null;
  END IF;

  -- Determine status and color
  IF v_successful_wakes = v_expected_wakes THEN
    v_status := 'excellent';
    v_color := '#10B981'; -- green
  ELSIF v_successful_wakes >= (v_expected_wakes * 0.66) THEN
    v_status := 'good';
    v_color := '#F59E0B'; -- yellow/amber
  ELSIF v_successful_wakes >= 1 THEN
    v_status := 'poor';
    v_color := '#EF4444'; -- red
  ELSE
    v_status := 'offline';
    v_color := '#EF4444'; -- red
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'color', v_color,
    'trailing_wakes_expected', v_expected_wakes,
    'trailing_wakes_actual', v_successful_wakes,
    'reliability_percent', v_reliability_percent,
    'last_expected_wakes', array_to_json(v_expected_wake_times)
  );
END;
$$;

COMMENT ON FUNCTION calculate_device_wake_reliability IS 'Calculate device wake reliability based on trailing N expected wakes vs actual activity';
COMMENT ON FUNCTION get_previous_wake_times IS 'Parse cron schedule and calculate previous N expected wake times';
COMMENT ON FUNCTION was_device_active_near IS 'Check if device had any activity (telemetry, images, last_seen) near expected wake time';

-- Update snapshot generation to include connectivity metadata
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
