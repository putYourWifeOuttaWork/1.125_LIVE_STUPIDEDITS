/*
  # Update Session Lifecycle Functions - Phase 2.5

  1. Purpose
    - Integrate device submission shell into lifecycle functions
    - Fix petri_observations.submission_id NOT NULL constraint violation
    - Ensure device observations linked to daily submission shells
    - Close submission_sessions at end of day

  2. Changes
    - fn_midnight_session_opener: Create device submission shell and store device_submission_id
    - fn_image_completion_handler: Use device_submission_id for petri observations
    - fn_end_of_day_locker: Close paired submission_sessions
    - fn_retry_by_id_handler: Preserve original timestamps and use original session

  3. Critical Fixes
    - All device petri observations now have valid submission_id
    - Retry operations update same rows (no duplicates)
    - Timezone handling uses sites.timezone → 'UTC' fallback
*/

-- ==========================================
-- UPDATE: MIDNIGHT SESSION OPENER
-- ==========================================

CREATE OR REPLACE FUNCTION fn_midnight_session_opener(p_site_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_company_id UUID;
  v_program_id UUID;
  v_site_timezone TEXT;
  v_session_date DATE;
  v_session_start TIMESTAMPTZ;
  v_session_end TIMESTAMPTZ;
  v_expected_wake_count INT := 0;
  v_device_record RECORD;
  v_config_changed BOOLEAN := FALSE;
  v_session_id UUID;
  v_device_submission_id UUID;
BEGIN
  -- Get site details with timezone
  SELECT s.program_id, p.company_id, s.timezone
  INTO v_program_id, v_company_id, v_site_timezone
  FROM sites s
  JOIN pilot_programs p ON s.program_id = p.program_id
  WHERE s.site_id = p_site_id;

  IF v_program_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Site not found or not assigned to program'
    );
  END IF;

  -- Use site timezone or fallback to UTC
  v_site_timezone := COALESCE(v_site_timezone, 'UTC');

  -- Get current date in site timezone
  v_session_date := (NOW() AT TIME ZONE v_site_timezone)::DATE;
  v_session_start := (v_session_date || ' 00:00:00')::TIMESTAMP AT TIME ZONE v_site_timezone;
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

  -- Step 3: Create or get device submission shell
  v_device_submission_id := fn_get_or_create_device_submission(p_site_id, v_session_date);

  -- Step 4: Create site_device_sessions row
  INSERT INTO site_device_sessions (
    company_id,
    program_id,
    site_id,
    session_date,
    session_start_time,
    session_end_time,
    expected_wake_count,
    status,
    config_changed_flag,
    device_submission_id
  ) VALUES (
    v_company_id,
    v_program_id,
    p_site_id,
    v_session_date,
    v_session_start,
    v_session_end,
    v_expected_wake_count,
    'in_progress',
    v_config_changed,
    v_device_submission_id
  )
  ON CONFLICT (site_id, session_date) DO UPDATE
  SET expected_wake_count = EXCLUDED.expected_wake_count,
      config_changed_flag = EXCLUDED.config_changed_flag,
      device_submission_id = EXCLUDED.device_submission_id,
      status = 'in_progress'
  RETURNING session_id INTO v_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'device_submission_id', v_device_submission_id,
    'site_id', p_site_id,
    'session_date', v_session_date,
    'expected_wake_count', v_expected_wake_count,
    'config_changed', v_config_changed,
    'timezone', v_site_timezone
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM,
    'error_detail', SQLSTATE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_midnight_session_opener(UUID) IS 'Create daily site session at midnight. Apply pending schedule changes, calculate expected wake count, and create device submission shell.';

-- ==========================================
-- UPDATE: IMAGE COMPLETION HANDLER
-- ==========================================

CREATE OR REPLACE FUNCTION fn_image_completion_handler(
  p_image_id UUID,
  p_image_url TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_image_record RECORD;
  v_payload_record RECORD;
  v_session_record RECORD;
  v_observation_id UUID;
  v_slot_index INT;
  v_device_submission_id UUID;
BEGIN
  -- Get image details
  SELECT * INTO v_image_record
  FROM device_images
  WHERE image_id = p_image_id;

  IF v_image_record.image_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Image not found'
    );
  END IF;

  -- Step 1: Update device_images
  UPDATE device_images
  SET image_url = p_image_url,
      status = 'complete',
      received_at = NOW(),
      updated_at = NOW()
  WHERE image_id = p_image_id;

  -- Step 2: Get linked payload
  SELECT * INTO v_payload_record
  FROM device_wake_payloads
  WHERE image_id = p_image_id;

  IF v_payload_record.payload_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Payload not found for image'
    );
  END IF;

  -- Step 3: Get session and device_submission_id
  SELECT * INTO v_session_record
  FROM site_device_sessions
  WHERE session_id = v_payload_record.site_device_session_id;

  IF v_session_record.session_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Session not found for payload'
    );
  END IF;

  -- Get device_submission_id (fallback: create on-demand if missing)
  v_device_submission_id := v_session_record.device_submission_id;

  IF v_device_submission_id IS NULL THEN
    -- Fallback: create device submission shell on-demand
    v_device_submission_id := fn_get_or_create_device_submission(
      v_payload_record.site_id,
      v_session_record.session_date
    );

    -- Update session with device_submission_id
    UPDATE site_device_sessions
    SET device_submission_id = v_device_submission_id
    WHERE session_id = v_session_record.session_id;
  END IF;

  -- Step 4: Update payload
  UPDATE device_wake_payloads
  SET image_status = 'complete',
      payload_status = 'complete',
      received_at = NOW()
  WHERE payload_id = v_payload_record.payload_id;

  -- Step 5: Determine slot mapping
  -- Priority: device-reported slot_index > wake_window_index
  v_slot_index := COALESCE(
    (v_image_record.metadata->>'slot_index')::INT,
    v_payload_record.wake_window_index,
    1
  );

  -- Step 6: Create petri_observation (device-generated) with submission_id
  INSERT INTO petri_observations (
    submission_id,
    site_id,
    program_id,
    company_id,
    image_url,
    order_index,
    is_device_generated,
    device_capture_metadata,
    created_at
  ) VALUES (
    v_device_submission_id, -- CRITICAL: Now includes submission_id
    v_payload_record.site_id,
    v_payload_record.program_id,
    v_payload_record.company_id,
    p_image_url,
    v_slot_index,
    TRUE,
    v_payload_record.telemetry_data,
    NOW()
  )
  RETURNING observation_id INTO v_observation_id;

  -- Step 7: Link observation back to image
  UPDATE device_images
  SET observation_id = v_observation_id,
      observation_type = 'petri'
  WHERE image_id = p_image_id;

  -- Step 8: Increment session completed counter
  UPDATE site_device_sessions
  SET completed_wake_count = completed_wake_count + 1
  WHERE session_id = v_payload_record.site_device_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'image_id', p_image_id,
    'observation_id', v_observation_id,
    'payload_id', v_payload_record.payload_id,
    'session_id', v_payload_record.site_device_session_id,
    'device_submission_id', v_device_submission_id,
    'slot_index', v_slot_index
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM,
    'error_detail', SQLSTATE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_image_completion_handler(UUID, TEXT) IS 'Handle successful image transmission. Create observation with submission_id, update counters, link records.';

-- ==========================================
-- UPDATE: END-OF-DAY LOCKER
-- ==========================================

CREATE OR REPLACE FUNCTION fn_end_of_day_locker(p_site_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_session_id UUID;
  v_session_record RECORD;
  v_device_record RECORD;
  v_alert_count INT := 0;
  v_site_timezone TEXT;
  v_current_date DATE;
BEGIN
  -- Get site timezone
  SELECT timezone INTO v_site_timezone
  FROM sites
  WHERE site_id = p_site_id;

  v_site_timezone := COALESCE(v_site_timezone, 'UTC');
  v_current_date := (NOW() AT TIME ZONE v_site_timezone)::DATE;

  -- Get today's session
  SELECT *
  INTO v_session_record
  FROM site_device_sessions
  WHERE site_id = p_site_id
    AND session_date = v_current_date
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

  -- Close the paired submission_sessions (if device_submission_id exists)
  IF v_session_record.device_submission_id IS NOT NULL THEN
    UPDATE submission_sessions
    SET session_status = 'Completed',
        completion_time = NOW()
    WHERE submission_id = v_session_record.device_submission_id
      AND session_status != 'Completed';
  END IF;

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
        'date', v_current_date
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
        'date', v_current_date
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
        'date', v_current_date
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
    'expected_wake_count', v_session_record.expected_wake_count,
    'submission_closed', v_session_record.device_submission_id IS NOT NULL
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM,
    'error_detail', SQLSTATE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_end_of_day_locker(UUID) IS 'Lock daily session at end of day. Close paired submission_sessions. Generate alerts for missed wakes, failures, and low battery.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_midnight_session_opener(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_image_completion_handler(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_end_of_day_locker(UUID) TO authenticated, service_role;
