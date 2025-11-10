/*
  # Device Submission System Functions

  1. Purpose
    - Automate device session lifecycle (create, lock, cleanup)
    - Handle wake payload ingestion and processing
    - Manage image transmission lifecycle (receive, retry, fail)
    - Maintain session counters and audit trails

  2. Functions
    - fn_midnight_session_opener() - Create daily sessions, apply schedule changes
    - fn_end_of_day_locker() - Lock sessions, generate alerts
    - fn_wake_ingestion_handler() - Process device wake metadata
    - fn_image_completion_handler() - Handle successful image transmission
    - fn_image_failure_handler() - Handle failed image transmission
    - fn_retry_by_id_handler() - Process image retry requests
    - Helper: fn_parse_cron_wake_count() - Parse cron to count daily wakes
    - Helper: fn_infer_wake_window_index() - Snap timestamp to schedule bucket

  3. Trigger Points
    - midnight_session_opener: pg_cron at 00:00 site timezone
    - end_of_day_locker: pg_cron at 23:59:59 site timezone
    - wake_ingestion: called by edge function on metadata receipt
    - image_completion: called by edge function on ACK_OK
    - image_failure: called by edge function on transmission failure
    - retry_by_id: called by edge function or user-initiated resend
*/

-- ==========================================
-- HELPER: PARSE CRON TO COUNT DAILY WAKES
-- ==========================================

CREATE OR REPLACE FUNCTION fn_parse_cron_wake_count(cron_expression TEXT)
RETURNS INT AS $$
DECLARE
  minute_part TEXT;
  hour_part TEXT;
  hour_count INT;
BEGIN
  -- Simple cron parser for common patterns
  -- Format: "minute hour * * *"
  -- Examples:
  --   "0 8,16 * * *" → 2 wakes (at 8am and 4pm)
  --   "0 */2 * * *" → 12 wakes (every 2 hours)
  --   "0 8 * * *" → 1 wake (at 8am)

  IF cron_expression IS NULL OR cron_expression = '' THEN
    RETURN 1; -- Default: once per day
  END IF;

  -- Split on spaces
  hour_part := split_part(cron_expression, ' ', 2);

  -- Count commas in hour part + 1
  IF hour_part LIKE '%,%' THEN
    -- Explicit hours: "8,16" = 2 wakes
    hour_count := array_length(string_to_array(hour_part, ','), 1);
    RETURN hour_count;
  ELSIF hour_part LIKE '*/%' THEN
    -- Every N hours: "*/2" = 24/2 = 12 wakes
    DECLARE
      interval_hours INT;
    BEGIN
      interval_hours := substring(hour_part FROM '\*/(\d+)')::INT;
      RETURN 24 / interval_hours;
    EXCEPTION WHEN OTHERS THEN
      RETURN 1; -- Fallback
    END;
  ELSE
    -- Single hour: "8" = 1 wake
    RETURN 1;
  END IF;

EXCEPTION WHEN OTHERS THEN
  -- Fallback: assume 1 wake per day
  RETURN 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_parse_cron_wake_count(TEXT) IS 'Parse cron expression to count expected wakes per day. Handles comma-separated hours and interval syntax.';

-- ==========================================
-- HELPER: INFER WAKE WINDOW INDEX
-- ==========================================

CREATE OR REPLACE FUNCTION fn_infer_wake_window_index(
  p_captured_at TIMESTAMPTZ,
  p_cron_expression TEXT,
  OUT wake_index INT,
  OUT is_overage BOOLEAN
)
AS $$
DECLARE
  hour_part TEXT;
  expected_hours INT[];
  captured_hour INT;
  closest_index INT;
  min_diff INT;
  i INT;
BEGIN
  -- Extract hour from captured_at
  captured_hour := EXTRACT(HOUR FROM p_captured_at)::INT;

  -- Parse cron to get expected hours
  hour_part := split_part(p_cron_expression, ' ', 2);

  IF hour_part LIKE '%,%' THEN
    -- Explicit hours: "8,16" → [8, 16]
    expected_hours := string_to_array(hour_part, ',')::INT[];
  ELSIF hour_part LIKE '*/%' THEN
    -- Every N hours: "*/2" → [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
    DECLARE
      interval_hours INT;
      h INT;
    BEGIN
      interval_hours := substring(hour_part FROM '\*/(\d+)')::INT;
      expected_hours := ARRAY[]::INT[];
      FOR h IN 0..23 BY interval_hours LOOP
        expected_hours := array_append(expected_hours, h);
      END LOOP;
    END;
  ELSE
    -- Single hour: "8" → [8]
    expected_hours := ARRAY[hour_part::INT];
  END IF;

  -- Find closest expected hour
  min_diff := 24;
  closest_index := 1;
  FOR i IN 1..array_length(expected_hours, 1) LOOP
    DECLARE
      diff INT;
    BEGIN
      diff := ABS(captured_hour - expected_hours[i]);
      IF diff < min_diff THEN
        min_diff := diff;
        closest_index := i;
      END IF;
    END;
  END LOOP;

  wake_index := closest_index;

  -- Overage if captured hour is more than 1 hour away from closest
  is_overage := min_diff > 1;

EXCEPTION WHEN OTHERS THEN
  wake_index := 1;
  is_overage := TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_infer_wake_window_index(TIMESTAMPTZ, TEXT) IS 'Snap captured timestamp to nearest schedule bucket. Returns wake index and overage flag.';

-- ==========================================
-- FUNCTION 1: MIDNIGHT SESSION OPENER
-- ==========================================

CREATE OR REPLACE FUNCTION fn_midnight_session_opener(p_site_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_company_id UUID;
  v_program_id UUID;
  v_session_date DATE;
  v_session_start TIMESTAMPTZ;
  v_session_end TIMESTAMPTZ;
  v_expected_wake_count INT := 0;
  v_device_record RECORD;
  v_config_changed BOOLEAN := FALSE;
  v_session_id UUID;
BEGIN
  -- Get site details
  SELECT s.program_id, p.company_id
  INTO v_program_id, v_company_id
  FROM sites s
  JOIN pilot_programs p ON s.program_id = p.program_id
  WHERE s.site_id = p_site_id;

  IF v_program_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Site not found or not assigned to program'
    );
  END IF;

  -- Get current date in UTC (adjust for site timezone in production)
  v_session_date := CURRENT_DATE;
  v_session_start := DATE_TRUNC('day', NOW());
  v_session_end := v_session_start + INTERVAL '1 day';

  -- Step 1: Apply pending schedule changes for today
  FOR v_device_record IN
    SELECT dsc.device_id, dsc.new_wake_schedule_cron, dsc.change_id
    FROM device_schedule_changes dsc
    JOIN device_site_assignments dsa ON dsc.device_id = dsa.device_id
    WHERE dsa.site_id = p_site_id
      AND dsa.is_active = TRUE
      AND dsc.effective_date = v_session_date
      AND dsc.applied_at IS NULL
    ORDER BY dsc.requested_at DESC
  LOOP
    -- Update device wake schedule
    UPDATE devices
    SET wake_schedule_cron = v_device_record.new_wake_schedule_cron,
        updated_at = NOW()
    WHERE device_id = v_device_record.device_id;

    -- Mark change as applied
    UPDATE device_schedule_changes
    SET applied_at = NOW(),
        applied_by_function = 'fn_midnight_session_opener'
    WHERE change_id = v_device_record.change_id;

    v_config_changed := TRUE;
  END LOOP;

  -- Step 2: Calculate expected_wake_count
  FOR v_device_record IN
    SELECT d.device_id, d.wake_schedule_cron
    FROM devices d
    JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
    WHERE dsa.site_id = p_site_id
      AND dsa.is_active = TRUE
      AND d.is_active = TRUE
  LOOP
    v_expected_wake_count := v_expected_wake_count +
      fn_parse_cron_wake_count(v_device_record.wake_schedule_cron);
  END LOOP;

  -- Step 3: Create site_device_sessions row
  INSERT INTO site_device_sessions (
    company_id,
    program_id,
    site_id,
    session_date,
    session_start_time,
    session_end_time,
    expected_wake_count,
    status,
    config_changed_flag
  ) VALUES (
    v_company_id,
    v_program_id,
    p_site_id,
    v_session_date,
    v_session_start,
    v_session_end,
    v_expected_wake_count,
    'in_progress',
    v_config_changed
  )
  ON CONFLICT (site_id, session_date) DO UPDATE
  SET expected_wake_count = EXCLUDED.expected_wake_count,
      config_changed_flag = EXCLUDED.config_changed_flag,
      status = 'in_progress'
  RETURNING session_id INTO v_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'site_id', p_site_id,
    'session_date', v_session_date,
    'expected_wake_count', v_expected_wake_count,
    'config_changed', v_config_changed
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_midnight_session_opener(UUID) IS 'Create daily site session at midnight. Apply pending schedule changes and calculate expected wake count.';

-- ==========================================
-- FUNCTION 2: END-OF-DAY LOCKER
-- ==========================================

CREATE OR REPLACE FUNCTION fn_end_of_day_locker(p_site_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_session_id UUID;
  v_session_record RECORD;
  v_device_record RECORD;
  v_alert_count INT := 0;
BEGIN
  -- Get today's session
  SELECT *
  INTO v_session_record
  FROM site_device_sessions
  WHERE site_id = p_site_id
    AND session_date = CURRENT_DATE
    AND status != 'locked';

  IF v_session_record.session_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No active session found for today'
    );
  END IF;

  v_session_id := v_session_record.session_id;

  -- Lock the session
  UPDATE site_device_sessions
  SET status = 'locked',
      locked_at = NOW()
  WHERE session_id = v_session_id;

  -- Check for missed wakes per device (>2 missed)
  FOR v_device_record IN
    SELECT
      d.device_id,
      d.device_name,
      fn_parse_cron_wake_count(d.wake_schedule_cron) AS expected_wakes,
      COUNT(dwp.payload_id) AS received_wakes
    FROM devices d
    JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
    LEFT JOIN device_wake_payloads dwp ON d.device_id = dwp.device_id
      AND dwp.site_device_session_id = v_session_id
    WHERE dsa.site_id = p_site_id
      AND dsa.is_active = TRUE
      AND d.is_active = TRUE
    GROUP BY d.device_id, d.device_name, d.wake_schedule_cron
    HAVING fn_parse_cron_wake_count(d.wake_schedule_cron) - COUNT(dwp.payload_id) > 2
  LOOP
    INSERT INTO device_alerts (
      device_id,
      alert_type,
      severity,
      message,
      metadata,
      company_id
    )
    SELECT
      v_device_record.device_id,
      'missed_wake',
      'warning',
      'Device missed ' || (v_device_record.expected_wakes - v_device_record.received_wakes) || ' wake windows today',
      jsonb_build_object(
        'session_id', v_session_id,
        'expected_wakes', v_device_record.expected_wakes,
        'received_wakes', v_device_record.received_wakes,
        'date', CURRENT_DATE
      ),
      v_session_record.company_id;

    v_alert_count := v_alert_count + 1;
  END LOOP;

  -- Check for high failure rate (>30%)
  IF v_session_record.expected_wake_count > 0
     AND (v_session_record.failed_wake_count::FLOAT / v_session_record.expected_wake_count) > 0.3 THEN

    INSERT INTO device_alerts (
      device_id,
      alert_type,
      severity,
      message,
      metadata,
      company_id
    )
    SELECT
      d.device_id,
      'high_failure_rate',
      'error',
      'Site had high failure rate: ' || v_session_record.failed_wake_count || '/' || v_session_record.expected_wake_count,
      jsonb_build_object(
        'session_id', v_session_id,
        'failure_rate', (v_session_record.failed_wake_count::FLOAT / v_session_record.expected_wake_count),
        'date', CURRENT_DATE
      ),
      v_session_record.company_id
    FROM devices d
    JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
    WHERE dsa.site_id = p_site_id
      AND dsa.is_active = TRUE
    LIMIT 1; -- One alert per site

    v_alert_count := v_alert_count + 1;
  END IF;

  -- Check for low battery (<3.6V) on any device
  FOR v_device_record IN
    SELECT d.device_id, d.device_name, d.battery_voltage
    FROM devices d
    JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
    WHERE dsa.site_id = p_site_id
      AND dsa.is_active = TRUE
      AND d.battery_voltage < 3.6
  LOOP
    INSERT INTO device_alerts (
      device_id,
      alert_type,
      severity,
      message,
      metadata,
      company_id
    ) VALUES (
      v_device_record.device_id,
      'low_battery',
      'critical',
      'Device battery critically low: ' || v_device_record.battery_voltage || 'V',
      jsonb_build_object(
        'battery_voltage', v_device_record.battery_voltage,
        'threshold', 3.6,
        'date', CURRENT_DATE
      ),
      v_session_record.company_id
    );

    v_alert_count := v_alert_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'locked_at', NOW(),
    'alerts_created', v_alert_count,
    'completed_wake_count', v_session_record.completed_wake_count,
    'failed_wake_count', v_session_record.failed_wake_count,
    'expected_wake_count', v_session_record.expected_wake_count
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_end_of_day_locker(UUID) IS 'Lock daily session at end of day. Generate alerts for missed wakes, failures, and low battery.';

-- ==========================================
-- FUNCTION 3: WAKE INGESTION HANDLER
-- ==========================================

CREATE OR REPLACE FUNCTION fn_wake_ingestion_handler(
  p_device_id UUID,
  p_captured_at TIMESTAMPTZ,
  p_image_name TEXT,
  p_telemetry_data JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_company_id UUID;
  v_program_id UUID;
  v_site_id UUID;
  v_session_id UUID;
  v_session_date DATE;
  v_wake_index INT;
  v_is_overage BOOLEAN;
  v_cron_expression TEXT;
  v_payload_id UUID;
  v_image_id UUID;
BEGIN
  -- Step 1: Resolve lineage
  SELECT
    dsa.site_id,
    s.program_id,
    p.company_id,
    d.wake_schedule_cron
  INTO v_site_id, v_program_id, v_company_id, v_cron_expression
  FROM devices d
  JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
  JOIN sites s ON dsa.site_id = s.site_id
  JOIN pilot_programs p ON s.program_id = p.program_id
  WHERE d.device_id = p_device_id
    AND dsa.is_active = TRUE
    AND dsa.is_primary = TRUE;

  IF v_site_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Device not assigned to active site'
    );
  END IF;

  -- Get session date from captured_at
  v_session_date := DATE(p_captured_at);

  -- Get or create session
  SELECT session_id INTO v_session_id
  FROM site_device_sessions
  WHERE site_id = v_site_id
    AND session_date = v_session_date;

  IF v_session_id IS NULL THEN
    -- Create session on-the-fly (handles late wakes)
    INSERT INTO site_device_sessions (
      company_id, program_id, site_id,
      session_date, session_start_time, session_end_time,
      expected_wake_count, status
    ) VALUES (
      v_company_id, v_program_id, v_site_id,
      v_session_date,
      DATE_TRUNC('day', p_captured_at),
      DATE_TRUNC('day', p_captured_at) + INTERVAL '1 day',
      0, 'in_progress'
    )
    RETURNING session_id INTO v_session_id;
  END IF;

  -- Step 2: Infer wake window index
  SELECT wake_index, is_overage
  INTO v_wake_index, v_is_overage
  FROM fn_infer_wake_window_index(p_captured_at, v_cron_expression);

  -- Step 3: Create device_wake_payloads
  INSERT INTO device_wake_payloads (
    company_id, program_id, site_id, site_device_session_id, device_id,
    captured_at, wake_window_index, overage_flag,
    temperature, humidity, pressure, gas_resistance, battery_voltage, wifi_rssi,
    telemetry_data, image_status, payload_status
  ) VALUES (
    v_company_id, v_program_id, v_site_id, v_session_id, p_device_id,
    p_captured_at, v_wake_index, v_is_overage,
    (p_telemetry_data->>'temperature')::NUMERIC,
    (p_telemetry_data->>'humidity')::NUMERIC,
    (p_telemetry_data->>'pressure')::NUMERIC,
    (p_telemetry_data->>'gas_resistance')::NUMERIC,
    (p_telemetry_data->>'battery_voltage')::NUMERIC,
    (p_telemetry_data->>'wifi_rssi')::INT,
    p_telemetry_data,
    'pending', 'pending'
  )
  RETURNING payload_id INTO v_payload_id;

  -- Step 4: Create device_images row
  INSERT INTO device_images (
    device_id, image_name, captured_at, status,
    total_chunks, metadata, company_id, original_capture_date
  ) VALUES (
    p_device_id, p_image_name, p_captured_at, 'receiving',
    (p_telemetry_data->>'total_chunks')::INT,
    p_telemetry_data, v_company_id, v_session_date
  )
  ON CONFLICT (device_id, image_name) DO UPDATE
  SET captured_at = EXCLUDED.captured_at,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
  RETURNING image_id INTO v_image_id;

  -- Link image to payload
  UPDATE device_wake_payloads
  SET image_id = v_image_id,
      image_status = 'receiving'
  WHERE payload_id = v_payload_id;

  -- Step 5: Update session counters if overage
  IF v_is_overage THEN
    UPDATE site_device_sessions
    SET extra_wake_count = extra_wake_count + 1
    WHERE session_id = v_session_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payload_id', v_payload_id,
    'image_id', v_image_id,
    'session_id', v_session_id,
    'wake_index', v_wake_index,
    'is_overage', v_is_overage
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_wake_ingestion_handler(UUID, TIMESTAMPTZ, TEXT, JSONB) IS 'Process device wake metadata. Create payload and image records, infer wake index, update counters.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_parse_cron_wake_count(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_infer_wake_window_index(TIMESTAMPTZ, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_midnight_session_opener(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_end_of_day_locker(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_wake_ingestion_handler(UUID, TIMESTAMPTZ, TEXT, JSONB) TO authenticated, service_role;
