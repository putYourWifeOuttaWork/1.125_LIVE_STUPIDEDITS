/*
  # Fix Snapshot Generation to Use Wake Payloads

  ## Problem
  The `generate_session_wake_snapshot` function queries `device_telemetry`
  directly, but telemetry is actually stored in `device_wake_payloads`.

  ## Solution
  Update the function to query telemetry from `device_wake_payloads` instead
  of `device_telemetry`. This aligns with the wake-centric architecture.

  ## Changes
  - Query device_wake_payloads for telemetry (temp, humidity, pressure, etc.)
  - Query device_wake_payloads for images via JOIN
  - Maintain LOCF (Last Observation Carried Forward) pattern
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

  -- Count images in this round (from wake_payloads)
  SELECT COUNT(DISTINCT dwp.image_id) INTO v_new_images_count
  FROM device_wake_payloads dwp
  WHERE dwp.site_device_session_id = p_session_id
    AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
    AND dwp.image_id IS NOT NULL;

  -- Count alerts in this round
  SELECT COUNT(*) INTO v_new_alerts_count
  FROM device_alerts
  WHERE site_id = v_site_id
    AND triggered_at BETWEEN p_wake_round_start AND p_wake_round_end;

  -- Build device states from wake_payloads
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
        -- Query telemetry from wake_payloads (current or LOCF)
        'telemetry', (
          SELECT COALESCE(
            -- Current wake
            (SELECT jsonb_build_object(
                'temperature', temperature,
                'humidity', humidity,
                'pressure', pressure,
                'gas_resistance', gas_resistance,
                'wifi_rssi', wifi_rssi,
                'captured_at', captured_at,
                'is_current', true,
                'data_freshness', 'current_wake'
              )
             FROM device_wake_payloads dwp
             WHERE dwp.device_id = d.device_id
               AND dwp.site_device_session_id = p_session_id
               AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
               AND dwp.temperature IS NOT NULL
             ORDER BY dwp.captured_at DESC LIMIT 1
            ),
            -- LOCF from previous wake
            (SELECT jsonb_build_object(
                'temperature', temperature,
                'humidity', humidity,
                'pressure', pressure,
                'gas_resistance', gas_resistance,
                'wifi_rssi', wifi_rssi,
                'captured_at', captured_at,
                'is_current', false,
                'data_freshness', 'carried_forward',
                'hours_since_last', ROUND(EXTRACT(EPOCH FROM (p_wake_round_end - captured_at)) / 3600, 2)
              )
             FROM device_wake_payloads dwp
             WHERE dwp.device_id = d.device_id
               AND dwp.site_device_session_id = p_session_id
               AND dwp.captured_at < p_wake_round_start
               AND dwp.temperature IS NOT NULL
             ORDER BY dwp.captured_at DESC LIMIT 1
            )
          )
        ),
        -- MGI from images linked to wake_payloads
        'mgi_state', (
          SELECT COALESCE(
            (SELECT calculate_mgi_metrics(d.device_id, di.mgi_score, di.captured_at)
             FROM device_wake_payloads dwp
             JOIN device_images di ON di.image_id = dwp.image_id
             WHERE dwp.device_id = d.device_id
               AND dwp.site_device_session_id = p_session_id
               AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
               AND di.mgi_score IS NOT NULL
             ORDER BY dwp.captured_at DESC LIMIT 1
            ),
            -- LOCF from previous wake
            (SELECT jsonb_build_object(
                'current_mgi', di.mgi_score,
                'captured_at', di.captured_at,
                'is_current', false,
                'data_freshness', 'carried_forward',
                'hours_since_last', ROUND(EXTRACT(EPOCH FROM (p_wake_round_end - di.captured_at)) / 3600, 2)
              )
             FROM device_wake_payloads dwp
             JOIN device_images di ON di.image_id = dwp.image_id
             WHERE dwp.device_id = d.device_id
               AND dwp.site_device_session_id = p_session_id
               AND dwp.captured_at < p_wake_round_start
               AND di.mgi_score IS NOT NULL
             ORDER BY dwp.captured_at DESC LIMIT 1
            )
          )
        ),
        -- Images from this round
        'images_this_round', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'image_id', di.image_id,
              'image_url', di.image_url,
              'mgi_score', di.mgi_score,
              'captured_at', di.captured_at,
              'observation_type', di.observation_type
            )
          )
          FROM device_wake_payloads dwp
          JOIN device_images di ON di.image_id = dwp.image_id
          WHERE dwp.device_id = d.device_id
            AND dwp.site_device_session_id = p_session_id
            AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
        ),
        -- Alerts
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
      ) ORDER BY d.device_code
    ) AS devices_array
    FROM devices d
    WHERE d.site_id = v_site_id AND d.is_active = true
  )

  -- Assemble site_state
  SELECT jsonb_build_object(
    'snapshot_metadata', jsonb_build_object(
      'wake_number', p_wake_number,
      'wake_round_start', p_wake_round_start,
      'wake_round_end', p_wake_round_end,
      'session_id', p_session_id
    ),
    'site_metadata', (
      SELECT jsonb_build_object(
        'site_id', site_id,
        'site_name', name,
        'site_code', site_code,
        'site_type', type,
        'dimensions', jsonb_build_object(
          'length', length,
          'width', width,
          'height', height
        )
      )
      FROM sites WHERE site_id = v_site_id
    ),
    'program_context', (
      SELECT jsonb_build_object(
        'program_id', program_id,
        'program_name', name,
        'program_start_date', start_date,
        'program_end_date', end_date
      )
      FROM pilot_programs WHERE program_id = v_program_id
    ),
    'devices', COALESCE((SELECT devices_array FROM device_states), '[]'::jsonb),
    'environmental_zones', generate_device_centered_zones(v_site_id),
    'session_metrics', jsonb_build_object(
      'active_devices_count', v_active_devices_count,
      'new_images_this_round', v_new_images_count,
      'new_alerts_this_round', v_new_alerts_count
    )
  ) INTO v_site_state;

  -- Calculate aggregate metrics from site_state
  SELECT
    AVG((device->>'telemetry')::jsonb->>'temperature')::numeric,
    AVG((device->>'telemetry')::jsonb->>'humidity')::numeric,
    AVG((device->>'mgi_state')::jsonb->>'current_mgi')::numeric,
    MAX((device->>'mgi_state')::jsonb->>'current_mgi')::numeric
  INTO v_avg_temp, v_avg_humidity, v_avg_mgi, v_max_mgi
  FROM jsonb_array_elements(v_site_state->'devices') AS device
  WHERE (device->>'telemetry')::jsonb IS NOT NULL
    OR (device->>'mgi_state')::jsonb IS NOT NULL;

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
  RETURNING snapshot_id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

COMMENT ON FUNCTION generate_session_wake_snapshot IS 'Generate snapshot using wake_payloads as data source (not device_telemetry). Includes LOCF for missing data.';
