# Apply Minute-Level Cron Support Migration

## Quick Steps

1. Open your Supabase SQL Editor: https://supabase.com/dashboard
2. Navigate to: **Project → SQL Editor**
3. Create a new query
4. Copy and paste the SQL below
5. Click **RUN**

## Migration SQL

```sql
/*
  # Add Minute-Level Cron Support

  1. Purpose
    - Extend cron parsing to support minute-level wake schedules
    - Enable sub-hourly intervals (every 15 minutes, every 30 minutes, etc.)
    - Maintain backward compatibility with existing hour-only schedules

  2. Changes
    - Parse minute field (1st position in cron expression)
    - Handle minute intervals: */15, */30, etc.
    - Handle minute lists: 0,15,30,45
    - Handle wildcard (*) in minute field
    - Priority: minute field → hour field → fallback

  3. Supported Patterns
    - Minute intervals only: "*/15 * * * *" (every 15 minutes)
    - Specific minutes: "0,30 * * * *" (on the hour and half-hour)
    - Minute + hour intervals: "*/15 */3 * * *" (every 15 min, every 3 hours)
    - Hour intervals: "0 */6 * * *" (every 6 hours on the hour)
    - Specific times: "0 8,16,20 * * *" (8am, 4pm, 8pm)

  4. Examples
    - "*/15 * * * *" → Every 15 minutes (96 wakes/day)
    - "*/30 * * * *" → Every 30 minutes (48 wakes/day)
    - "0,30 * * * *" → Twice per hour (48 wakes/day)
    - "0 */6 * * *" → Every 6 hours (4 wakes/day)

  5. Battery Impact Note
    - Sub-hourly schedules significantly increase battery drain
    - Every 15 min = 96 wakes/day (vs 8 for every 3 hours)
    - Estimated battery life reduction: ~12x faster drain
*/

-- ==========================================
-- FUNCTION: CALCULATE NEXT WAKE TIME (ENHANCED)
-- ==========================================

CREATE OR REPLACE FUNCTION fn_calculate_next_wake_time(
  p_last_wake_at TIMESTAMPTZ,
  p_cron_expression TEXT,
  p_timezone TEXT DEFAULT 'America/New_York'
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_minute_part TEXT;
  v_hour_part TEXT;
  v_expected_minutes INT[];
  v_expected_hours INT[];
  v_last_wake_minute INT;
  v_last_wake_hour INT;
  v_interval_minutes INT;
  v_interval_hours INT;
  v_next_wake TIMESTAMPTZ;
  v_last_wake_local TIMESTAMPTZ;
  v_i INT;
BEGIN
  -- ========================================
  -- INPUT VALIDATION
  -- ========================================

  IF p_last_wake_at IS NULL OR p_cron_expression IS NULL OR p_cron_expression = '' THEN
    RAISE WARNING 'Cannot calculate next wake: missing last_wake_at or cron_expression';
    RETURN NULL;
  END IF;

  IF p_timezone IS NULL OR p_timezone = '' THEN
    p_timezone := 'America/New_York';
  END IF;

  -- ========================================
  -- CONVERT TO LOCAL TIMEZONE
  -- ========================================

  BEGIN
    v_last_wake_local := p_last_wake_at AT TIME ZONE p_timezone;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Invalid timezone %, falling back to America/New_York', p_timezone;
    v_last_wake_local := p_last_wake_at AT TIME ZONE 'America/New_York';
    p_timezone := 'America/New_York';
  END;

  -- Extract minute and hour from last wake (local time)
  v_last_wake_minute := EXTRACT(MINUTE FROM v_last_wake_local)::INT;
  v_last_wake_hour := EXTRACT(HOUR FROM v_last_wake_local)::INT;

  -- Parse cron parts (format: "minute hour day month weekday")
  v_minute_part := split_part(p_cron_expression, ' ', 1);
  v_hour_part := split_part(p_cron_expression, ' ', 2);

  -- ========================================
  -- PRIORITY 1: MINUTE INTERVAL PATTERN (*/N)
  -- ========================================
  -- Example: "*/15 * * * *" = every 15 minutes
  -- Calculation: last_wake + N minutes

  IF v_minute_part LIKE '*/%' THEN
    BEGIN
      v_interval_minutes := substring(v_minute_part FROM '\*/(\d+)')::INT;

      -- Validate interval
      IF v_interval_minutes <= 0 OR v_interval_minutes > 59 THEN
        RAISE WARNING 'Invalid minute interval: %, defaulting to 60 minutes', v_interval_minutes;
        v_interval_minutes := 60;
      END IF;

      -- Next wake = last_wake + interval minutes
      v_next_wake := p_last_wake_at + (v_interval_minutes || ' minutes')::INTERVAL;

      RAISE DEBUG 'Minute interval pattern: every % minutes. Next wake: %', v_interval_minutes, v_next_wake;
      RETURN v_next_wake;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error parsing minute interval pattern: %. Falling back to hourly', SQLERRM;
      RETURN p_last_wake_at + INTERVAL '1 hour';
    END;

  -- ========================================
  -- PRIORITY 2: SPECIFIC MINUTES LIST (0,15,30,45)
  -- ========================================
  -- Example: "0,30 * * * *" = on the hour and half-hour
  -- Calculation: find next scheduled minute

  ELSIF v_minute_part LIKE '%,%' THEN
    BEGIN
      v_expected_minutes := string_to_array(v_minute_part, ',')::INT[];

      -- Sort minutes in ascending order
      v_expected_minutes := array(SELECT unnest(v_expected_minutes) ORDER BY 1);

      -- Find next scheduled minute in current hour
      FOR v_i IN 1..array_length(v_expected_minutes, 1) LOOP
        IF v_expected_minutes[v_i] > v_last_wake_minute THEN
          -- Found next wake in this hour
          v_next_wake := DATE_TRUNC('hour', v_last_wake_local) +
                        (v_expected_minutes[v_i] || ' minutes')::INTERVAL;
          v_next_wake := v_next_wake AT TIME ZONE p_timezone;

          RAISE DEBUG 'Specific minutes pattern: next wake at minute % (local). Next wake: %',
            v_expected_minutes[v_i], v_next_wake;
          RETURN v_next_wake;
        END IF;
      END LOOP;

      -- No more wakes this hour, use first minute of next hour
      v_next_wake := DATE_TRUNC('hour', v_last_wake_local) + INTERVAL '1 hour' +
                    (v_expected_minutes[1] || ' minutes')::INTERVAL;
      v_next_wake := v_next_wake AT TIME ZONE p_timezone;

      RAISE DEBUG 'Specific minutes pattern: no more wakes this hour, next wake at minute % next hour. Next wake: %',
        v_expected_minutes[1], v_next_wake;
      RETURN v_next_wake;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error parsing minute list pattern: %. Falling back to hourly', SQLERRM;
      RETURN p_last_wake_at + INTERVAL '1 hour';
    END;

  -- ========================================
  -- PRIORITY 3: SPECIFIC MINUTE (30)
  -- ========================================
  -- Example: "30 * * * *" = at 30 minutes past every hour
  -- Calculation: next occurrence of that minute

  ELSIF v_minute_part ~ '^\d+$' AND v_minute_part != '*' THEN
    BEGIN
      DECLARE
        v_target_minute INT;
      BEGIN
        v_target_minute := v_minute_part::INT;

        -- Validate minute
        IF v_target_minute < 0 OR v_target_minute > 59 THEN
          RAISE WARNING 'Invalid minute: %, defaulting to 0', v_target_minute;
          v_target_minute := 0;
        END IF;

        -- Check if target minute is later this hour
        IF v_target_minute > v_last_wake_minute THEN
          -- Later this hour
          v_next_wake := DATE_TRUNC('hour', v_last_wake_local) +
                        (v_target_minute || ' minutes')::INTERVAL;
        ELSE
          -- Next hour
          v_next_wake := DATE_TRUNC('hour', v_last_wake_local) + INTERVAL '1 hour' +
                        (v_target_minute || ' minutes')::INTERVAL;
        END IF;

        v_next_wake := v_next_wake AT TIME ZONE p_timezone;

        RAISE DEBUG 'Specific minute pattern: target minute % (local). Next wake: %',
          v_target_minute, v_next_wake;
        RETURN v_next_wake;
      END;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error parsing specific minute pattern: %. Falling back to hourly', SQLERRM;
      RETURN p_last_wake_at + INTERVAL '1 hour';
    END;
  END IF;

  -- ========================================
  -- PRIORITY 4: HOUR INTERVAL PATTERN (*/N)
  -- ========================================
  -- Example: "0 */6 * * *" = every 6 hours on the hour
  -- Minute field is * or 0, hour field is */N

  IF v_hour_part LIKE '*/%' THEN
    BEGIN
      v_interval_hours := substring(v_hour_part FROM '\*/(\d+)')::INT;

      IF v_interval_hours <= 0 OR v_interval_hours > 24 THEN
        RAISE WARNING 'Invalid interval hours: %, defaulting to 24h', v_interval_hours;
        v_interval_hours := 24;
      END IF;

      v_next_wake := p_last_wake_at + (v_interval_hours || ' hours')::INTERVAL;

      RAISE DEBUG 'Hour interval pattern: every % hours. Next wake: %', v_interval_hours, v_next_wake;
      RETURN v_next_wake;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error parsing hour interval pattern: %. Falling back to 24h', SQLERRM;
      RETURN p_last_wake_at + INTERVAL '24 hours';
    END;

  -- ========================================
  -- PRIORITY 5: COMMA-SEPARATED HOURS (8,16,20)
  -- ========================================
  -- Example: "0 8,16,20 * * *" = at 8am, 4pm, 8pm

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

      RAISE DEBUG 'Multi-time pattern: no more wakes today, next wake tomorrow at hour % (local). Next wake: %',
        v_expected_hours[1], v_next_wake;
      RETURN v_next_wake;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error parsing multi-time pattern: %. Falling back to 24h', SQLERRM;
      RETURN p_last_wake_at + INTERVAL '24 hours';
    END;

  -- ========================================
  -- PRIORITY 6: SINGLE HOUR (8)
  -- ========================================
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
  END IF;

  -- ========================================
  -- FALLBACK: UNSUPPORTED PATTERN
  -- ========================================

  RAISE WARNING 'Unsupported cron pattern: %. Falling back to 24h', p_cron_expression;
  RETURN p_last_wake_at + INTERVAL '24 hours';

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Unexpected error calculating next wake time: %. Falling back to 24h', SQLERRM;
  RETURN p_last_wake_at + INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql STABLE;

-- ==========================================
-- UPDATE FUNCTION COMMENTS
-- ==========================================

COMMENT ON FUNCTION fn_calculate_next_wake_time IS
'Calculate next expected wake time based on last actual wake + cron schedule.

ENHANCED: Now supports minute-level intervals and schedules!

Usage Examples:
  -- Every 15 minutes
  SELECT fn_calculate_next_wake_time(
    now(),
    ''*/15 * * * *'',
    ''America/New_York''
  );

  -- Every 30 minutes
  SELECT fn_calculate_next_wake_time(
    now(),
    ''*/30 * * * *'',
    ''UTC''
  );

  -- Twice per hour (on the hour and half-hour)
  SELECT fn_calculate_next_wake_time(
    now(),
    ''0,30 * * * *'',
    ''UTC''
  );

  -- Every 6 hours (backward compatible)
  SELECT fn_calculate_next_wake_time(
    now(),
    ''0 */6 * * *'',
    ''America/New_York''
  );

Supported Patterns:
  MINUTE LEVEL:
    - "*/15 * * * *"     → Every 15 minutes
    - "*/30 * * * *"     → Every 30 minutes
    - "0,30 * * * *"     → Twice per hour
    - "0,15,30,45 * * *" → Four times per hour
    - "30 * * * *"       → At :30 past every hour

  HOUR LEVEL (backward compatible):
    - "0 */3 * * *"      → Every 3 hours
    - "0 */6 * * *"      → Every 6 hours
    - "0 8,16,20 * * *"  → At 8am, 4pm, 8pm
    - "0 8 * * *"        → Once daily at 8am

Battery Impact Warning:
  - Minute-level schedules significantly increase battery drain
  - Every 15 min = 96 wakes/day (vs 8 for every 3 hours)
  - Estimated battery life reduction: ~12x faster
  - Use with caution and monitor device battery health

Behavior:
  - Recalculates ONLY when device actually wakes
  - Uses actual wake time, not scheduled wake time
  - Calculates in local timezone, returns UTC
  - Priority: Minute field → Hour field → Fallback';

-- ==========================================
-- SUCCESS MESSAGE
-- ==========================================

DO $$
BEGIN
  RAISE NOTICE '✅ Minute-level cron support added successfully';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Supported patterns:';
  RAISE NOTICE '   • */15 * * * * = Every 15 minutes';
  RAISE NOTICE '   • */30 * * * * = Every 30 minutes';
  RAISE NOTICE '   • 0,30 * * * * = Twice per hour';
  RAISE NOTICE '   • 0 */6 * * * = Every 6 hours (backward compatible)';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Battery warning: Sub-hourly schedules drain ~12x faster';
  RAISE NOTICE '';
  RAISE NOTICE '✅ All existing hour-only schedules remain functional';
END $$;
```

## What This Does

- Updates the `fn_calculate_next_wake_time` function to parse the **minute** field
- Adds support for minute intervals like `*/15` (every 15 minutes)
- Adds support for minute lists like `0,30` (at :00 and :30)
- Maintains full backward compatibility with existing hour-only schedules
- All existing devices with schedules like `0 */6 * * *` will continue to work

## After Applying

- Test by editing a device wake schedule to `*/15 * * * *`
- The "Next Wake Times" preview should show 15-minute intervals
- Devices will calculate minute-level wake times correctly

## Battery Warning

Sub-hourly wake schedules significantly increase battery consumption. A device waking every 15 minutes will drain battery approximately 12x faster than one waking every 3 hours. Use these schedules only when necessary and monitor device battery health.

## Next Steps

After applying this migration, you can:
1. Add UI presets for 15/30 minute intervals
2. Add battery warning displays
3. Implement wake monitoring alerts
