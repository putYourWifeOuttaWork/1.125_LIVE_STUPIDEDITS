-- Fix get_next_wake_times Function for Cron Schema
--
-- 1. Changes
--    - Rewrite function to use wake_schedule_cron (TEXT) instead of wake_schedule_config (JSONB)
--    - Use existing fn_calculate_next_wake_time() function for cron parsing
--    - Query last_wake_at from devices table as starting point
--    - Loop to generate N wake times by repeatedly calling calculation function
--
-- 2. Schema Alignment
--    - devices.wake_schedule_cron = TEXT cron expression (e.g., every 6 hours)
--    - devices.last_wake_at = Starting point for calculations
--    - Uses site timezone for proper time calculations
--
-- 3. Security
--    - Maintains SECURITY DEFINER for RLS bypass
--    - Grants execute to authenticated users

-- Drop existing function
DROP FUNCTION IF EXISTS get_next_wake_times(uuid, integer);

-- Create corrected function that uses wake_schedule_cron
CREATE OR REPLACE FUNCTION get_next_wake_times(
  p_device_id uuid,
  p_count integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cron_expression text;
  v_last_wake_at timestamptz;
  v_timezone text;
  v_wake_times jsonb := '[]'::jsonb;
  v_current_wake timestamptz;
  v_next_wake timestamptz;
  i integer;
BEGIN
  -- Get device wake schedule and timezone
  SELECT
    d.wake_schedule_cron,
    d.last_wake_at,
    COALESCE(s.timezone, 'UTC')
  INTO
    v_cron_expression,
    v_last_wake_at,
    v_timezone
  FROM devices d
  LEFT JOIN sites s ON d.site_id = s.site_id
  WHERE d.device_id = p_device_id;

  -- If device not found, return error
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'wake_times', '[]'::jsonb,
      'timezone', 'UTC',
      'error', 'Device not found'
    );
  END IF;

  -- If no cron schedule configured, return error
  IF v_cron_expression IS NULL OR v_cron_expression = '' THEN
    RETURN jsonb_build_object(
      'wake_times', '[]'::jsonb,
      'timezone', v_timezone,
      'error', 'No wake schedule configured for this device'
    );
  END IF;

  -- Use last_wake_at as starting point, or NOW() if device has never woken
  v_current_wake := COALESCE(v_last_wake_at, now());

  -- Generate next N wake times by repeatedly calling calculation function
  FOR i IN 1..p_count LOOP
    -- Calculate next wake time from current wake
    v_next_wake := fn_calculate_next_wake_time(
      v_current_wake,
      v_cron_expression,
      v_timezone
    );

    -- Add to results array
    v_wake_times := v_wake_times || to_jsonb(v_next_wake);

    -- Set current to next for next iteration
    v_current_wake := v_next_wake;
  END LOOP;

  -- Return wake times with timezone info
  RETURN jsonb_build_object(
    'wake_times', v_wake_times,
    'timezone', v_timezone,
    'cron_expression', v_cron_expression
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_next_wake_times(uuid, integer) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_next_wake_times IS
'Calculate the next N wake times for a device based on its wake_schedule_cron.
Uses fn_calculate_next_wake_time() to handle cron expression parsing.
Returns array of timestamps in device timezone with timezone info.';
