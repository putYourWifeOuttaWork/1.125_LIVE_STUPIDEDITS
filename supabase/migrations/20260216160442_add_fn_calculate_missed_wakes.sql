/*
  # Add missed wake calculation function

  1. New Functions
    - `fn_calculate_missed_wakes(p_wake_schedule_cron TEXT, p_last_wake_at TIMESTAMPTZ)`
      - Returns INTEGER count of expected wake windows that have been missed since last wake
      - Uses existing cron-parsing logic from fn_parse_cron_wake_count
      - Calculates the interval between expected wakes from the cron expression
      - Divides elapsed time since last wake by that interval to get missed count
      - Returns 0 if device has no cron schedule or no last wake timestamp

  2. Important Notes
    - This function is read-only and does not modify any data
    - Used by DeviceStatusBadge UI to determine Active/Warning/Inactive status
    - Active: last wake within 48h AND missed <= 1
    - Warning: last wake within 48h AND missed > 1
    - Inactive: no wake in trailing 48h
*/

CREATE OR REPLACE FUNCTION fn_calculate_missed_wakes(
  p_wake_schedule_cron TEXT,
  p_last_wake_at TIMESTAMPTZ
)
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_minute_part TEXT;
  v_hour_part TEXT;
  v_interval_minutes NUMERIC;
  v_elapsed_minutes NUMERIC;
  v_expected_wakes INT;
  v_missed INT;
BEGIN
  IF p_last_wake_at IS NULL OR p_wake_schedule_cron IS NULL OR p_wake_schedule_cron = '' THEN
    RETURN 0;
  END IF;

  v_elapsed_minutes := EXTRACT(EPOCH FROM (NOW() - p_last_wake_at)) / 60.0;

  IF v_elapsed_minutes <= 0 THEN
    RETURN 0;
  END IF;

  v_minute_part := split_part(p_wake_schedule_cron, ' ', 1);
  v_hour_part := split_part(p_wake_schedule_cron, ' ', 2);

  IF v_minute_part LIKE '*/%' THEN
    BEGIN
      v_interval_minutes := substring(v_minute_part FROM '\*/(\d+)')::NUMERIC;
      IF v_interval_minutes <= 0 OR v_interval_minutes > 60 THEN
        v_interval_minutes := 60;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_interval_minutes := 60;
    END;

  ELSIF v_minute_part LIKE '%,%' AND v_hour_part = '*' THEN
    DECLARE
      v_minutes_arr INT[];
      v_count INT;
    BEGIN
      v_minutes_arr := string_to_array(v_minute_part, ',')::INT[];
      v_count := array_length(v_minutes_arr, 1);
      IF v_count > 1 THEN
        v_interval_minutes := 60.0 / v_count;
      ELSE
        v_interval_minutes := 60;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_interval_minutes := 60;
    END;

  ELSIF v_hour_part LIKE '*/%' THEN
    BEGIN
      v_interval_minutes := substring(v_hour_part FROM '\*/(\d+)')::NUMERIC * 60;
      IF v_interval_minutes <= 0 THEN
        v_interval_minutes := 1440;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_interval_minutes := 1440;
    END;

  ELSIF v_hour_part LIKE '%,%' THEN
    DECLARE
      v_hours_arr INT[];
      v_count INT;
    BEGIN
      v_hours_arr := string_to_array(v_hour_part, ',')::INT[];
      v_count := array_length(v_hours_arr, 1);
      IF v_count > 1 THEN
        v_interval_minutes := 1440.0 / v_count;
      ELSE
        v_interval_minutes := 1440;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_interval_minutes := 1440;
    END;

  ELSIF v_hour_part ~ '^\d+$' AND v_minute_part ~ '^\d+$' THEN
    v_interval_minutes := 1440;

  ELSIF v_hour_part = '*' AND v_minute_part ~ '^\d+$' THEN
    v_interval_minutes := 60;

  ELSIF v_hour_part = '*' AND v_minute_part = '*' THEN
    v_interval_minutes := 1;

  ELSE
    v_interval_minutes := 1440;
  END IF;

  v_expected_wakes := FLOOR(v_elapsed_minutes / v_interval_minutes)::INT;

  v_missed := GREATEST(0, v_expected_wakes - 1);

  RETURN v_missed;

EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$;

COMMENT ON FUNCTION fn_calculate_missed_wakes IS
'Calculates the number of expected wake windows missed since the last wake, based on the cron schedule. Returns 0 if inputs are null. Used for device status determination (Active/Warning/Inactive).';
