-- FINAL FIX: Remove date calculations from CTE entirely

DROP FUNCTION IF EXISTS generate_session_wake_snapshot CASCADE;

CREATE FUNCTION generate_session_wake_snapshot(
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

  -- Build site state with connectivity metadata (NO DATE CALCULATIONS)
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
      'program_end_date', pp.end_date
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
        'telemetry', jsonb_build_object(
          'latest_temperature', (
            SELECT temperature FROM device_telemetry
            WHERE device_id = d.device_id
              AND captured_at <= p_wake_round_end
            ORDER BY captured_at DESC
            LIMIT 1
          ),
          'latest_humidity', (
            SELECT humidity FROM device_telemetry
            WHERE device_id = d.device_id
              AND captured_at <= p_wake_round_end
            ORDER BY captured_at DESC
            LIMIT 1
          )
        ),
        'mgi_state', jsonb_build_object(
          'latest_mgi_score', (
            SELECT mgi_score FROM device_images
            WHERE device_id = d.device_id
              AND captured_at <= p_wake_round_end
              AND mgi_score IS NOT NULL
            ORDER BY captured_at DESC
            LIMIT 1
          ),
          'mgi_velocity', (
            SELECT mgi_velocity_per_day FROM device_images
            WHERE device_id = d.device_id
              AND captured_at <= p_wake_round_end
              AND mgi_velocity_per_day IS NOT NULL
            ORDER BY captured_at DESC
            LIMIT 1
          )
        ),
        'connectivity', calculate_device_wake_reliability(d.device_id, v_site_id, p_wake_round_end, 3)
      )
    ) AS devices_json
    FROM devices d
    WHERE d.site_id = v_site_id
      AND d.is_active = true
      AND d.x_position IS NOT NULL
      AND d.y_position IS NOT NULL
  )
  SELECT jsonb_build_object(
    'site', (SELECT site_metadata FROM site_meta),
    'program', (SELECT program_context FROM program_meta),
    'devices', COALESCE((SELECT devices_json FROM device_states), '[]'::jsonb)
  ) INTO v_site_state;

  -- Calculate aggregate metrics
  SELECT
    AVG((device_data->>'latest_temperature')::numeric),
    AVG((device_data->>'latest_humidity')::numeric),
    AVG((device_data->>'latest_mgi_score')::numeric),
    MAX((device_data->>'latest_mgi_score')::numeric)
  INTO v_avg_temp, v_avg_humidity, v_avg_mgi, v_max_mgi
  FROM jsonb_array_elements(v_site_state->'devices') AS device_data;

  -- Insert or update snapshot
  INSERT INTO session_wake_snapshots (
    snapshot_id,
    session_id,
    site_id,
    program_id,
    company_id,
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
    gen_random_uuid(),
    p_session_id,
    v_site_id,
    v_program_id,
    v_company_id,
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
  ON CONFLICT (session_id, wake_number)
  DO UPDATE SET
    wake_round_start = EXCLUDED.wake_round_start,
    wake_round_end = EXCLUDED.wake_round_end,
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

GRANT EXECUTE ON FUNCTION generate_session_wake_snapshot TO service_role;
GRANT EXECUTE ON FUNCTION generate_session_wake_snapshot TO authenticated;

-- Test it
SELECT generate_session_wake_snapshot(
  '3db2ce6a-a0d0-4da0-a4dd-c418dca64bd4'::uuid,
  1,
  '2025-11-21T14:00:00Z'::timestamptz,
  '2025-11-21T15:00:00Z'::timestamptz
);
