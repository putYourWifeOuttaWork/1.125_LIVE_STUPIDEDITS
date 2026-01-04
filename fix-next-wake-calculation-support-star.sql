-- Fix fn_calculate_next_wake_time to Support Wildcard (*)
--
-- Problem: The function doesn't handle "*" (every hour/unit)
-- Currently "0 * * * *" falls through to 24h fallback
--
-- Solution: Detect "*" and treat as interval of 1 unit
-- Example: "0 * * * *" = every 1 hour

DROP FUNCTION IF EXISTS fn_calculate_next_wake_time(TIMESTAMPTZ, TEXT, TEXT);

CREATE OR REPLACE FUNCTION fn_calculate_next_wake_time(
  p_last_wake_at TIMESTAMPTZ,
  p_cron_expression TEXT,
  p_timezone TEXT DEFAULT 'America/New_York'
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_hour_part TEXT;
  v_expected_hours INT[];
  v_last_wake_hour INT;
  v_interval_hours INT;
  v_next_wake TIMESTAMPTZ;
  v_last_wake_local TIMESTAMPTZ;
  v_i INT;
BEGIN
  -- INPUT VALIDATION
  IF p_last_wake_at IS NULL OR p_cron_expression IS NULL OR p_cron_expression = '' THEN
    RAISE WARNING 'Cannot calculate next wake: missing last_wake_at or cron_expression';
    RETURN NULL;
  END IF;

  IF p_timezone IS NULL OR p_timezone = '' THEN
    p_timezone := 'America/New_York';
  END IF;

  -- CONVERT TO LOCAL TIMEZONE
  BEGIN
    v_last_wake_local := p_last_wake_at AT TIME ZONE p_timezone;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Invalid timezone %, falling back to America/New_York', p_timezone;
    v_last_wake_local := p_last_wake_at AT TIME ZONE 'America/New_York';
    p_timezone := 'America/New_York';
  END;

  v_last_wake_hour := EXTRACT(HOUR FROM v_last_wake_local)::INT;

  -- Parse cron hour part (format: "minute hour * * *")
  v_hour_part := split_part(p_cron_expression, ' ', 2);

  -- CASE 1: WILDCARD (*) - Every hour
  -- Example: "0 * * * *" = every 1 hour
  IF v_hour_part = '*' THEN
    v_next_wake := p_last_wake_at + INTERVAL '1 hour';
    RAISE DEBUG 'Wildcard pattern: every 1 hour. Next wake: %', v_next_wake;
    RETURN v_next_wake;

  -- CASE 2: INTERVAL PATTERN (*/N)
  -- Example: "0 */6 * * *" = every 6 hours
  ELSIF v_hour_part LIKE '*/%' THEN
    BEGIN
      v_interval_hours := substring(v_hour_part FROM '\*/(\d+)')::INT;

      IF v_interval_hours <= 0 OR v_interval_hours > 24 THEN
        RAISE WARNING 'Invalid interval hours: %, defaulting to 24h', v_interval_hours;
        v_interval_hours := 24;
      END IF;

      v_next_wake := p_last_wake_at + (v_interval_hours || ' hours')::INTERVAL;

      RAISE DEBUG 'Interval pattern: every % hours. Next wake: %', v_interval_hours, v_next_wake;
      RETURN v_next_wake;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error parsing interval pattern: %. Falling back to 24h', SQLERRM;
      RETURN p_last_wake_at + INTERVAL '24 hours';
    END;

  -- CASE 3: COMMA-SEPARATED HOURS (8,16,20)
  -- Example: "0 8,16,20 * * *" = at 8am, 4pm, 8pm
  ELSIF v_hour_part LIKE '%,%' THEN
    BEGIN
      v_expected_hours := string_to_array(v_hour_part, ',')::INT[];
      v_expected_hours := array(SELECT unnest(v_expected_hours) ORDER BY 1);

      -- Find next scheduled hour after last wake hour
      FOR v_i IN 1..array_length(v_expected_hours, 1) LOOP
        IF v_expected_hours[v_i] > v_last_wake_hour THEN
          v_next_wake := DATE_TRUNC('day', v_last_wake_local) +
                        (v_expected_hours[v_i] || ' hours')::INTERVAL;
          v_next_wake := v_next_wake AT TIME ZONE p_timezone;

          RAISE DEBUG 'Multi-time pattern: next wake at hour % (local). Next wake: %',
            v_expected_hours[v_i], v_next_wake;
          RETURN v_next_wake;
        END IF;
      END LOOP;

      -- No more wakes today, use first wake tomorrow
      v_next_wake := DATE_TRUNC('day', v_last_wake_local) + INTERVAL '1 day' +
                    (v_expected_hours[1] || ' hours')::INTERVAL;
      v_next_wake := v_next_wake AT TIME ZONE p_timezone;

      RAISE DEBUG 'Multi-time pattern: no more wakes today, next wake tomorrow at hour % (local). Next wake: %',
        v_expected_hours[1], v_next_wake;
      RETURN v_next_wake;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error parsing multi-time pattern: %. Falling back to 24h', SQLERRM;
      RETURN p_last_wake_at + INTERVAL '24 hours';
    END;

  -- CASE 4: SINGLE HOUR (8)
  -- Example: "0 8 * * *" = once daily at 8am
  ELSIF v_hour_part ~ '^\d+$' THEN
    BEGIN
      DECLARE
        v_target_hour INT;
      BEGIN
        v_target_hour := v_hour_part::INT;

        IF v_target_hour < 0 OR v_target_hour > 23 THEN
          RAISE WARNING 'Invalid hour: %, defaulting to 8', v_target_hour;
          v_target_hour := 8;
        END IF;

        IF v_target_hour > v_last_wake_hour THEN
          v_next_wake := DATE_TRUNC('day', v_last_wake_local) +
                        (v_target_hour || ' hours')::INTERVAL;
        ELSE
          v_next_wake := DATE_TRUNC('day', v_last_wake_local) + INTERVAL '1 day' +
                        (v_target_hour || ' hours')::INTERVAL;
        END IF;

        v_next_wake := v_next_wake AT TIME ZONE p_timezone;

        RAISE DEBUG 'Single-time pattern: target hour % (local). Next wake: %',
          v_target_hour, v_next_wake;
        RETURN v_next_wake;
      END;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error parsing single-time pattern: %. Falling back to 24h', SQLERRM;
      RETURN p_last_wake_at + INTERVAL '24 hours';
    END;

  -- FALLBACK: UNSUPPORTED PATTERN
  ELSE
    RAISE WARNING 'Unsupported cron pattern: %. Falling back to 24h', p_cron_expression;
    RETURN p_last_wake_at + INTERVAL '24 hours';
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Unexpected error calculating next wake time: %. Falling back to 24h', SQLERRM;
  RETURN p_last_wake_at + INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_calculate_next_wake_time IS
'Calculate next expected wake time based on last actual wake + cron schedule.

Supported Cron Patterns:
  - "0 * * * *"        → Every 1 hour (wildcard)
  - "0 */3 * * *"      → Every 3 hours (interval)
  - "0 */6 * * *"      → Every 6 hours (interval)
  - "0 8,16,20 * * *"  → At 8am, 4pm, 8pm (multiple times)
  - "0 8 * * *"        → Once daily at 8am (single time)

Returns UTC timestamp for database storage.';

GRANT EXECUTE ON FUNCTION fn_calculate_next_wake_time TO service_role;
GRANT EXECUTE ON FUNCTION fn_calculate_next_wake_time TO authenticated;
