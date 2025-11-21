/*
  # Wake Reliability Calculation for Connectivity Indicator

  ## Purpose
  Calculate wake reliability for devices to power the connectivity indicator

  ## Inputs
  - device_id: UUID
  - lookback_wakes: INT (default 3 - check last N expected wakes)

  ## Returns
  JSONB with:
  - status: 'excellent' | 'good' | 'poor' | 'offline' | 'unknown'
  - color: CSS color code
  - trailing_wakes_expected: number of expected wakes checked
  - trailing_wakes_actual: number of actual wakes received
  - reliability_percent: percentage (0-100)
  - last_expected_wakes: array of ISO timestamps for expected wakes

  ## Logic
  1. Get device's wake_schedule_cron
  2. Calculate last N expected wake times
  3. Check for actual wake_payloads within ±1 hour of each expected time
  4. Calculate reliability and assign status/color
*/

-- ==========================================
-- HELPER: PARSE CRON TO GET WAKE HOURS
-- ==========================================

CREATE OR REPLACE FUNCTION fn_get_cron_wake_hours(p_cron_expression TEXT)
RETURNS INT[] AS $$
DECLARE
  hour_part TEXT;
  result INT[];
  interval_hours INT;
  h INT;
BEGIN
  IF p_cron_expression IS NULL OR p_cron_expression = '' THEN
    RETURN ARRAY[]::INT[];
  END IF;

  -- Get hour part (2nd field after space)
  hour_part := split_part(p_cron_expression, ' ', 2);

  IF hour_part LIKE '%,%' THEN
    -- Explicit hours: "8,16,20" → [8, 16, 20]
    result := string_to_array(hour_part, ',')::INT[];
    RETURN result;
  ELSIF hour_part LIKE '*/%' THEN
    -- Every N hours: "*/3" → [0, 3, 6, 9, 12, 15, 18, 21]
    interval_hours := substring(hour_part FROM '\*/(\d+)')::INT;
    result := ARRAY[]::INT[];
    FOR h IN 0..23 BY interval_hours LOOP
      result := array_append(result, h);
    END LOOP;
    RETURN result;
  ELSIF hour_part = '*' THEN
    -- Every hour
    result := ARRAY[]::INT[];
    FOR h IN 0..23 LOOP
      result := array_append(result, h);
    END LOOP;
    RETURN result;
  ELSE
    -- Single hour: "8" → [8]
    RETURN ARRAY[hour_part::INT];
  END IF;

EXCEPTION WHEN OTHERS THEN
  RETURN ARRAY[]::INT[];
END;
$$ LANGUAGE plpgsql STABLE;

-- ==========================================
-- MAIN: CALCULATE WAKE RELIABILITY
-- ==========================================

CREATE OR REPLACE FUNCTION fn_calculate_wake_reliability(
  p_device_id UUID,
  p_lookback_wakes INT DEFAULT 3,
  p_timezone TEXT DEFAULT 'America/New_York'
)
RETURNS JSONB AS $$
DECLARE
  v_cron_expression TEXT;
  v_wake_hours INT[];
  v_expected_times TIMESTAMPTZ[];
  v_actual_count INT := 0;
  v_expected_count INT;
  v_reliability_percent NUMERIC;
  v_status TEXT;
  v_color TEXT;
  v_now TIMESTAMPTZ;
  v_current_hour INT;
  v_prev_wake TIMESTAMPTZ;
  i INT;
BEGIN
  -- Get device's wake schedule
  SELECT wake_schedule_cron,
         COALESCE((SELECT timezone FROM sites WHERE site_id = d.site_id LIMIT 1), p_timezone)
  INTO v_cron_expression, p_timezone
  FROM devices d
  WHERE device_id = p_device_id;

  IF v_cron_expression IS NULL OR v_cron_expression = '' THEN
    RETURN jsonb_build_object(
      'status', 'unknown',
      'color', '#9CA3AF',
      'trailing_wakes_expected', 0,
      'trailing_wakes_actual', 0,
      'reliability_percent', NULL,
      'last_expected_wakes', '[]'::jsonb
    );
  END IF;

  -- Get wake hours from cron
  v_wake_hours := fn_get_cron_wake_hours(v_cron_expression);

  IF array_length(v_wake_hours, 1) IS NULL OR array_length(v_wake_hours, 1) = 0 THEN
    RETURN jsonb_build_object(
      'status', 'unknown',
      'color', '#9CA3AF',
      'trailing_wakes_expected', 0,
      'trailing_wakes_actual', 0,
      'reliability_percent', NULL,
      'last_expected_wakes', '[]'::jsonb
    );
  END IF;

  -- Get current time in device timezone
  v_now := NOW() AT TIME ZONE p_timezone;
  v_current_hour := EXTRACT(HOUR FROM v_now)::INT;

  -- Calculate last N expected wake times
  v_expected_times := ARRAY[]::TIMESTAMPTZ[];
  v_prev_wake := v_now;

  -- Work backwards from now to find last N expected wakes
  FOR i IN 1..p_lookback_wakes LOOP
    -- Find the most recent wake hour before v_prev_wake
    DECLARE
      target_hour INT;
      target_time TIMESTAMPTZ;
      found BOOLEAN := FALSE;
    BEGIN
      -- Try hours in current day, working backwards
      FOR target_hour IN SELECT unnest(v_wake_hours) AS h ORDER BY h DESC LOOP
        target_time := date_trunc('day', v_prev_wake) + (target_hour || ' hours')::INTERVAL;

        IF target_time < v_prev_wake THEN
          v_expected_times := array_append(v_expected_times, target_time);
          v_prev_wake := target_time - INTERVAL '1 minute'; -- Move back to find previous
          found := TRUE;
          EXIT;
        END IF;
      END LOOP;

      -- If no wake found in current day, go to previous day
      IF NOT found THEN
        v_prev_wake := date_trunc('day', v_prev_wake) - INTERVAL '1 second';
      END IF;
    END;
  END LOOP;

  v_expected_count := array_length(v_expected_times, 1);

  -- Check for actual wakes within ±1 hour of each expected time
  FOR i IN 1..v_expected_count LOOP
    DECLARE
      expected_time TIMESTAMPTZ := v_expected_times[i];
      has_wake BOOLEAN;
    BEGIN
      SELECT EXISTS (
        SELECT 1
        FROM device_wake_payloads
        WHERE device_id = p_device_id
          AND captured_at BETWEEN (expected_time - INTERVAL '1 hour')
                               AND (expected_time + INTERVAL '1 hour')
      ) INTO has_wake;

      IF has_wake THEN
        v_actual_count := v_actual_count + 1;
      END IF;
    END;
  END LOOP;

  -- Calculate reliability percentage
  IF v_expected_count > 0 THEN
    v_reliability_percent := (v_actual_count::NUMERIC / v_expected_count::NUMERIC) * 100;
  ELSE
    v_reliability_percent := 0;
  END IF;

  -- Determine status and color
  IF v_reliability_percent >= 90 THEN
    v_status := 'excellent';
    v_color := '#10B981'; -- Green
  ELSIF v_reliability_percent >= 66 THEN
    v_status := 'good';
    v_color := '#3B82F6'; -- Blue
  ELSIF v_reliability_percent >= 33 THEN
    v_status := 'poor';
    v_color := '#F59E0B'; -- Orange
  ELSE
    v_status := 'offline';
    v_color := '#EF4444'; -- Red
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'color', v_color,
    'trailing_wakes_expected', v_expected_count,
    'trailing_wakes_actual', v_actual_count,
    'reliability_percent', ROUND(v_reliability_percent, 1),
    'last_expected_wakes', to_jsonb(v_expected_times)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'status', 'unknown',
    'color', '#9CA3AF',
    'trailing_wakes_expected', 0,
    'trailing_wakes_actual', 0,
    'reliability_percent', NULL,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_get_cron_wake_hours(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_calculate_wake_reliability(UUID, INT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION fn_calculate_wake_reliability(UUID, INT, TEXT) IS
'Calculate wake reliability for device connectivity indicator. Returns status, color, counts, and percentage based on last N expected wakes.';

-- ==========================================
-- TEST THE FUNCTION
-- ==========================================

-- Test with a device
DO $$
DECLARE
  test_device_id UUID := '15207d5d-1c32-4559-a3e8-216cee867527';
  result JSONB;
BEGIN
  SELECT fn_calculate_wake_reliability(test_device_id, 3) INTO result;
  RAISE NOTICE 'Wake Reliability Result: %', result;
END $$;
