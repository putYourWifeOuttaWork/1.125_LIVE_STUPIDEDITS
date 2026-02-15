/*
  # Fix session wake snapshot data quality

  1. Bug Fixes
    - Relax `di.status = 'complete'` to `di.status IN ('complete', 'receiving')` so
      images still transferring but already containing valid telemetry are included
    - Remove `AND di.temperature IS NOT NULL` guard that excluded images with partial
      telemetry (e.g., humidity but no temperature). Data fidelity over data perfection.
    - Compute and insert aggregate columns: avg_temperature, avg_humidity, avg_mgi, max_mgi
      from the device state data already collected

  2. Changes
    - `generate_session_wake_snapshot` function updated with relaxed filters
    - Aggregate values now computed from the site_state JSON after building it
    - Aggregates use COALESCE patterns so missing individual values never block computation

  3. Important Notes
    - Does NOT touch MQTT service or device communication code
    - Existing snapshots are not modified; only new snapshots benefit from these fixes
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
  v_avg_temperature numeric;
  v_avg_humidity numeric;
  v_avg_mgi numeric;
  v_max_mgi numeric;
BEGIN
  SELECT site_id, program_id, company_id
  INTO v_site_id, v_program_id, v_company_id
  FROM site_device_sessions
  WHERE session_id = p_session_id;

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  WITH device_states AS (
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
          SELECT COALESCE(
            (SELECT jsonb_build_object(
                'temperature', di.temperature,
                'humidity', di.humidity,
                'pressure', di.pressure,
                'gas_resistance', di.gas_resistance,
                'wifi_rssi', (di.metadata->>'wifi_rssi')::numeric,
                'captured_at', di.captured_at,
                'is_current', true,
                'data_freshness', 'current_wake',
                'wake_payload_id', di.wake_payload_id,
                'image_id', di.image_id
              )
             FROM device_images di
             WHERE di.device_id = d.device_id
               AND di.site_device_session_id = p_session_id
               AND di.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
               AND di.status IN ('complete', 'receiving')
               AND (di.temperature IS NOT NULL OR di.humidity IS NOT NULL)
             ORDER BY di.captured_at DESC
             LIMIT 1
            ),
            (SELECT jsonb_build_object(
                'temperature', di.temperature,
                'humidity', di.humidity,
                'pressure', di.pressure,
                'gas_resistance', di.gas_resistance,
                'wifi_rssi', (di.metadata->>'wifi_rssi')::numeric,
                'captured_at', di.captured_at,
                'is_current', false,
                'data_freshness', 'carried_forward',
                'hours_since_last', ROUND(EXTRACT(EPOCH FROM (p_wake_round_end - di.captured_at)) / 3600, 2),
                'wake_payload_id', di.wake_payload_id,
                'image_id', di.image_id
              )
             FROM device_images di
             WHERE di.device_id = d.device_id
               AND di.site_device_session_id = p_session_id
               AND di.captured_at < p_wake_round_start
               AND di.status IN ('complete', 'receiving')
               AND (di.temperature IS NOT NULL OR di.humidity IS NOT NULL)
             ORDER BY di.captured_at DESC
             LIMIT 1
            )
          )
        ),
        'mgi_state', (
          SELECT COALESCE(
            (SELECT calculate_mgi_metrics(d.device_id, di.mgi_score, di.captured_at)
             FROM device_images di
             WHERE di.device_id = d.device_id
               AND di.mgi_score IS NOT NULL
               AND di.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
             ORDER BY di.captured_at DESC
             LIMIT 1
            ),
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
             ORDER BY di.captured_at DESC
             LIMIT 1
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
              'observation_type', observation_type,
              'wake_payload_id', wake_payload_id
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
            AND da.triggered_at BETWEEN p_wake_round_start AND p_wake_round_end
        )
      )
    ) AS device_data
    FROM devices d
    WHERE d.site_id = v_site_id AND d.is_active = true
  )
  SELECT device_data INTO v_site_state FROM device_states;

  SELECT COUNT(*) INTO v_active_devices_count
  FROM devices
  WHERE site_id = v_site_id AND is_active = true;

  SELECT COUNT(*) INTO v_new_images_count
  FROM device_images
  WHERE site_id = v_site_id
    AND captured_at BETWEEN p_wake_round_start AND p_wake_round_end;

  SELECT COUNT(*) INTO v_new_alerts_count
  FROM device_alerts
  WHERE site_id = v_site_id
    AND triggered_at BETWEEN p_wake_round_start AND p_wake_round_end;

  SELECT
    AVG((dev->>'telemetry')::jsonb->>'temperature')::numeric,
    AVG((dev->>'telemetry')::jsonb->>'humidity')::numeric,
    AVG(
      COALESCE(
        ((dev->'mgi_state'->>'current_mgi')::numeric),
        ((dev->'mgi_state'->'mgi_progression'->>'percent_of_max')::numeric)
      )
    ),
    MAX(
      COALESCE(
        ((dev->'mgi_state'->>'current_mgi')::numeric),
        ((dev->'mgi_state'->'mgi_progression'->>'percent_of_max')::numeric)
      )
    )
  INTO v_avg_temperature, v_avg_humidity, v_avg_mgi, v_max_mgi
  FROM jsonb_array_elements(COALESCE(v_site_state, '[]'::jsonb)) dev
  WHERE dev->'telemetry' IS NOT NULL AND dev->>'telemetry' != 'null';

  INSERT INTO session_wake_snapshots (
    session_id,
    company_id,
    program_id,
    site_id,
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
    p_session_id,
    v_company_id,
    v_program_id,
    v_site_id,
    p_wake_number,
    p_wake_round_start,
    p_wake_round_end,
    v_site_state,
    v_active_devices_count,
    v_new_images_count,
    v_new_alerts_count,
    v_avg_temperature,
    v_avg_humidity,
    v_avg_mgi,
    v_max_mgi
  )
  RETURNING snapshot_id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;
