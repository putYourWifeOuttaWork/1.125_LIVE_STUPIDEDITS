-- Fix RAISE WARNING statements that use invalid %.X format
-- PostgreSQL RAISE uses % as placeholder, but %.X is invalid
-- Should be just % or use format()

CREATE OR REPLACE FUNCTION fn_calculate_next_wake_time(
  p_last_wake_at TIMESTAMPTZ,
  p_cron_expression TEXT,
  p_timezone TEXT DEFAULT 'America/New_York'
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_hour_part TEXT;
  v_interval_hours INT;
  v_expected_hours INT[];
  v_last_wake_local TIMESTAMPTZ;
  v_last_wake_hour INT;
  v_next_wake TIMESTAMPTZ;
  v_i INT;
BEGIN
  -- Convert last wake to device's local timezone
  v_last_wake_local := p_last_wake_at AT TIME ZONE p_timezone;
  v_last_wake_hour := EXTRACT(HOUR FROM v_last_wake_local);

  -- Extract hour component from cron (format: "minute hour * * *")
  v_hour_part := split_part(p_cron_expression, ' ', 2);

  -- CASE 1: INTERVAL PATTERN (*/N)
  IF v_hour_part LIKE '*/%' THEN
    BEGIN
      v_interval_hours := substring(v_hour_part from '\\d+')::INT;
      v_next_wake := p_last_wake_at + (v_interval_hours || ' hours')::INTERVAL;
      RAISE DEBUG 'Interval pattern: every % hours. Next wake: %', v_interval_hours, v_next_wake;
      RETURN v_next_wake;
    EXCEPTION WHEN OTHERS THEN
      -- FIX: Use % placeholder correctly
      RAISE WARNING 'Error parsing interval pattern: %. Falling back to 24h', SQLERRM;
      RETURN p_last_wake_at + INTERVAL '24 hours';
    END;

  -- CASE 2: COMMA-SEPARATED HOURS (8,16,20)
  ELSIF v_hour_part LIKE '%,%' THEN
    BEGIN
      v_expected_hours := string_to_array(v_hour_part, ',')::INT[];
      v_expected_hours := array(SELECT unnest(v_expected_hours) ORDER BY 1);

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

      RAISE DEBUG 'Multi-time pattern: no more wakes today, next is tomorrow at hour %', v_expected_hours[1];
      RETURN v_next_wake;

    EXCEPTION WHEN OTHERS THEN
      -- FIX: Use % placeholder correctly
      RAISE WARNING 'Error parsing multi-time pattern: %. Falling back to 24h', SQLERRM;
      RETURN p_last_wake_at + INTERVAL '24 hours';
    END;

  -- CASE 3: SINGLE HOUR (8)
  ELSIF v_hour_part ~ '^\\d+$' THEN
    BEGIN
      v_interval_hours := v_hour_part::INT;

      IF v_interval_hours > v_last_wake_hour THEN
        -- Wake later today
        v_next_wake := DATE_TRUNC('day', v_last_wake_local) +
                      (v_interval_hours || ' hours')::INTERVAL;
      ELSE
        -- Wake tomorrow at same hour
        v_next_wake := DATE_TRUNC('day', v_last_wake_local) + INTERVAL '1 day' +
                      (v_interval_hours || ' hours')::INTERVAL;
      END IF;

      -- Convert back to UTC
      v_next_wake := v_next_wake AT TIME ZONE p_timezone;

      RAISE DEBUG 'Single-time pattern: next wake at hour % (local). Next wake: %', v_interval_hours, v_next_wake;
      RETURN v_next_wake;

    EXCEPTION WHEN OTHERS THEN
      -- FIX: Use % placeholder correctly
      RAISE WARNING 'Error parsing single-time pattern: %. Falling back to 24h', SQLERRM;
      RETURN p_last_wake_at + INTERVAL '24 hours';
    END;

  ELSE
    -- FIX: Use % placeholder correctly
    RAISE WARNING 'Unsupported cron pattern: %. Falling back to 24h', p_cron_expression;
    RETURN p_last_wake_at + INTERVAL '24 hours';
  END IF;

EXCEPTION WHEN OTHERS THEN
  -- FIX: Use % placeholder correctly
  RAISE WARNING 'Unexpected error calculating next wake time: %. Falling back to 24h', SQLERRM;
  RETURN p_last_wake_at + INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;
