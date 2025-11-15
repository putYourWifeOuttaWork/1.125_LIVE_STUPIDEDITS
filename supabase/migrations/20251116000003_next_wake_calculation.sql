/*
  # Next Wake Time Calculation Function

  1. Purpose
    - Calculate next expected wake time based on last actual wake + cron schedule
    - Handles multiple cron patterns (intervals, specific times, mixed)
    - Uses site timezone for accurate local time calculation
    - Recalculates ONLY when device actually wakes

  2. Function
    - fn_calculate_next_wake_time(last_wake, cron, timezone) → TIMESTAMPTZ
    - Returns next wake time in UTC
    - Calculates based on actual wake behavior, not scheduled behavior

  3. Cron Pattern Support
    - Interval: "0 */6 * * *" (every 6 hours)
    - Specific times: "0 8,16,20 * * *" (at 8am, 4pm, 8pm)
    - Single time: "0 8 * * *" (once daily at 8am)

  4. Example Flows
    - Device set to every 6 hours
    - Expected wake: 12:00
    - Actual wake: 12:30 (30min late)
    - Next calculated wake: 12:30 + 6h = 18:30 (not 18:00)

  5. Timezone Handling
    - Calculations done in site local timezone
    - Returns UTC timestamp for storage
    - Fallback to Eastern Time if no timezone provided
*/

-- ==========================================
-- FUNCTION: CALCULATE NEXT WAKE TIME
-- ==========================================

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
  -- ========================================
  -- INPUT VALIDATION
  -- ========================================

  -- Validate required inputs
  IF p_last_wake_at IS NULL OR p_cron_expression IS NULL OR p_cron_expression = '' THEN
    RAISE WARNING 'Cannot calculate next wake: missing last_wake_at or cron_expression';
    RETURN NULL;
  END IF;

  -- Validate timezone
  IF p_timezone IS NULL OR p_timezone = '' THEN
    p_timezone := 'America/New_York'; -- Fallback to Eastern Time
  END IF;

  -- ========================================
  -- CONVERT TO LOCAL TIMEZONE
  -- ========================================

  -- Convert last wake to site timezone for local time calculations
  BEGIN
    v_last_wake_local := p_last_wake_at AT TIME ZONE p_timezone;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Invalid timezone %, falling back to America/New_York', p_timezone;
    v_last_wake_local := p_last_wake_at AT TIME ZONE 'America/New_York';
    p_timezone := 'America/New_York';
  END;

  -- Extract hour from last wake (local time)
  v_last_wake_hour := EXTRACT(HOUR FROM v_last_wake_local)::INT;

  -- Parse cron hour part (format: "minute hour * * *")
  v_hour_part := split_part(p_cron_expression, ' ', 2);

  -- ========================================
  -- CASE 1: INTERVAL PATTERN (*/N)
  -- ========================================
  -- Example: "0 */6 * * *" = every 6 hours
  -- Calculation: last_wake + N hours

  IF v_hour_part LIKE '*/%' THEN
    BEGIN
      v_interval_hours := substring(v_hour_part FROM '\*/(\d+)')::INT;

      -- Validate interval
      IF v_interval_hours <= 0 OR v_interval_hours > 24 THEN
        RAISE WARNING 'Invalid interval hours: %, defaulting to 24h', v_interval_hours;
        v_interval_hours := 24;
      END IF;

      -- Next wake = last_wake + interval hours
      v_next_wake := p_last_wake_at + (v_interval_hours || ' hours')::INTERVAL;

      RAISE DEBUG 'Interval pattern: every % hours. Next wake: %', v_interval_hours, v_next_wake;
      RETURN v_next_wake;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error parsing interval pattern: %. Falling back to 24h', SQLERRM;
      RETURN p_last_wake_at + INTERVAL '24 hours';
    END;

  -- ========================================
  -- CASE 2: COMMA-SEPARATED HOURS (8,16,20)
  -- ========================================
  -- Example: "0 8,16,20 * * *" = at 8am, 4pm, 8pm
  -- Calculation: find next scheduled hour after current hour

  ELSIF v_hour_part LIKE '%,%' THEN
    BEGIN
      v_expected_hours := string_to_array(v_hour_part, ',')::INT[];

      -- Sort hours in ascending order
      v_expected_hours := array(SELECT unnest(v_expected_hours) ORDER BY 1);

      -- Find next scheduled hour after last wake hour
      FOR v_i IN 1..array_length(v_expected_hours, 1) LOOP
        IF v_expected_hours[v_i] > v_last_wake_hour THEN
          -- Found next wake today (same day in local time)
          v_next_wake := DATE_TRUNC('day', v_last_wake_local) +
                        (v_expected_hours[v_i] || ' hours')::INTERVAL;
          -- Convert back to UTC
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

  -- ========================================
  -- CASE 3: SINGLE HOUR (8)
  -- ========================================
  -- Example: "0 8 * * *" = once daily at 8am
  -- Calculation: next occurrence of that hour

  ELSIF v_hour_part ~ '^\d+$' THEN
    BEGIN
      DECLARE
        v_target_hour INT;
      BEGIN
        v_target_hour := v_hour_part::INT;

        -- Validate hour
        IF v_target_hour < 0 OR v_target_hour > 23 THEN
          RAISE WARNING 'Invalid hour: %, defaulting to 8', v_target_hour;
          v_target_hour := 8;
        END IF;

        -- Check if target hour is later today
        IF v_target_hour > v_last_wake_hour THEN
          -- Later today (same day in local time)
          v_next_wake := DATE_TRUNC('day', v_last_wake_local) +
                        (v_target_hour || ' hours')::INTERVAL;
        ELSE
          -- Tomorrow
          v_next_wake := DATE_TRUNC('day', v_last_wake_local) + INTERVAL '1 day' +
                        (v_target_hour || ' hours')::INTERVAL;
        END IF;

        -- Convert back to UTC
        v_next_wake := v_next_wake AT TIME ZONE p_timezone;

        RAISE DEBUG 'Single-time pattern: target hour % (local). Next wake: %',
          v_target_hour, v_next_wake;
        RETURN v_next_wake;
      END;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error parsing single-time pattern: %. Falling back to 24h', SQLERRM;
      RETURN p_last_wake_at + INTERVAL '24 hours';
    END;

  -- ========================================
  -- FALLBACK: UNSUPPORTED PATTERN
  -- ========================================

  ELSE
    RAISE WARNING 'Unsupported cron pattern: %. Falling back to 24h', p_cron_expression;
    RETURN p_last_wake_at + INTERVAL '24 hours';
  END IF;

EXCEPTION WHEN OTHERS THEN
  -- Top-level exception handler
  RAISE WARNING 'Unexpected error calculating next wake time: %. Falling back to 24h', SQLERRM;
  RETURN p_last_wake_at + INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql STABLE;

-- ==========================================
-- FUNCTION METADATA
-- ==========================================

COMMENT ON FUNCTION fn_calculate_next_wake_time IS
'Calculate next expected wake time based on last actual wake + cron schedule.

Usage:
  SELECT fn_calculate_next_wake_time(
    ''2025-11-15 12:30:00+00''::timestamptz,  -- last actual wake (UTC)
    ''0 */6 * * *'',                          -- wake every 6 hours
    ''America/New_York''                       -- site timezone
  );
  -- Returns: 2025-11-15 18:30:00+00 (6 hours later)

Behavior:
  - Recalculates ONLY when device actually wakes
  - Uses actual wake time, not scheduled wake time
  - Calculates in local timezone, returns UTC
  - Handles intervals (*/N), multiple times (H,H,H), and single times (H)

Cron Pattern Examples:
  - "0 */3 * * *"      → Every 3 hours
  - "0 */6 * * *"      → Every 6 hours
  - "0 8,16,20 * * *"  → At 8am, 4pm, 8pm
  - "0 8 * * *"        → Once daily at 8am

Timezone:
  - Uses site timezone for local time calculations
  - Falls back to America/New_York if invalid/missing
  - Returns UTC timestamp for database storage';

-- ==========================================
-- GRANT PERMISSIONS
-- ==========================================

-- Allow edge functions to call this function
GRANT EXECUTE ON FUNCTION fn_calculate_next_wake_time TO service_role;
GRANT EXECUTE ON FUNCTION fn_calculate_next_wake_time TO authenticated;
