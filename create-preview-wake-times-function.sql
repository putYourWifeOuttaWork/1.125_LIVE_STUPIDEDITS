/*
  # Preview Next Wake Times Function

  1. Purpose
    - Allow previewing next wake times for ANY cron expression
    - Used by Device Edit Modal to show wake time preview before saving
    - Does not require device to exist or have saved cron

  2. Function
    - preview_next_wake_times(cron, timezone, start_from, count) → JSON
    - Calculates N future wake times from a starting point
    - Returns array of ISO timestamps

  3. Usage
    - Device edit preview: Show wake times for selected preset
    - Testing: Verify cron patterns calculate correctly
    - Schedule changes: Preview before applying to device
*/

-- ==========================================
-- FUNCTION: PREVIEW NEXT WAKE TIMES
-- ==========================================

CREATE OR REPLACE FUNCTION preview_next_wake_times(
  p_cron_expression TEXT,
  p_timezone TEXT DEFAULT 'UTC',
  p_start_from TIMESTAMPTZ DEFAULT NOW(),
  p_count INT DEFAULT 3
) RETURNS JSON AS $$
DECLARE
  v_wake_times TIMESTAMPTZ[];
  v_current_wake TIMESTAMPTZ;
  v_i INT;
BEGIN
  -- Validate inputs
  IF p_cron_expression IS NULL OR p_cron_expression = '' THEN
    RETURN json_build_object(
      'wake_times', '[]'::json,
      'timezone', p_timezone,
      'cron_expression', p_cron_expression,
      'error', 'Cron expression is required'
    );
  END IF;

  IF p_count <= 0 OR p_count > 10 THEN
    p_count := 3; -- Default to 3, max 10
  END IF;

  -- Initialize with starting point
  v_current_wake := p_start_from;
  v_wake_times := ARRAY[]::TIMESTAMPTZ[];

  -- Calculate next N wake times
  FOR v_i IN 1..p_count LOOP
    v_current_wake := fn_calculate_next_wake_time(
      v_current_wake,
      p_cron_expression,
      p_timezone
    );

    IF v_current_wake IS NULL THEN
      EXIT; -- Stop if calculation fails
    END IF;

    v_wake_times := array_append(v_wake_times, v_current_wake);
  END LOOP;

  -- Return as JSON
  RETURN json_build_object(
    'wake_times', array_to_json(v_wake_times),
    'timezone', p_timezone,
    'cron_expression', p_cron_expression
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'wake_times', '[]'::json,
    'timezone', p_timezone,
    'cron_expression', p_cron_expression,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ==========================================
-- FUNCTION METADATA
-- ==========================================

COMMENT ON FUNCTION preview_next_wake_times IS
'Preview next wake times for any cron expression without saving to device.

Usage:
  -- Preview "Daily at noon" schedule
  SELECT preview_next_wake_times(
    ''0 12 * * *'',           -- cron expression
    ''America/New_York'',      -- timezone
    NOW(),                     -- start from now
    3                          -- get 3 future wake times
  );

Returns JSON:
  {
    "wake_times": ["2026-01-04T17:00:00Z", "2026-01-05T17:00:00Z", "2026-01-06T17:00:00Z"],
    "timezone": "America/New_York",
    "cron_expression": "0 12 * * *"
  }

Parameters:
  - p_cron_expression: Cron expression to preview
  - p_timezone: Timezone for local time calculations (default: UTC)
  - p_start_from: Starting point for calculations (default: NOW())
  - p_count: Number of future wake times to calculate (default: 3, max: 10)';

-- ==========================================
-- GRANT PERMISSIONS
-- ==========================================

GRANT EXECUTE ON FUNCTION preview_next_wake_times TO service_role;
GRANT EXECUTE ON FUNCTION preview_next_wake_times TO authenticated;
