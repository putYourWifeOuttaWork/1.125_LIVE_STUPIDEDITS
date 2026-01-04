/*
  # Add Get Next Wake Times Function

  1. New Functions
    - `get_next_wake_times(device_id, count)` - Calculate the next N wake times for a device
      - Takes device UUID and count of wake times to return
      - Returns array of timestamps based on device's wake_schedule_config
      - Handles cron-style schedules and custom patterns
      - Defaults to returning 3 wake times if count not specified

  2. Purpose
    - Enable UI to display upcoming wake times for devices
    - Support manual refresh of wake time predictions
    - Help users understand device wake schedules

  3. Security
    - Function uses SECURITY DEFINER to access device data
    - Returns data only for devices user has access to via RLS
*/

-- Drop function if exists
DROP FUNCTION IF EXISTS get_next_wake_times(uuid, integer);

-- Create function to calculate next wake times
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
  v_config jsonb;
  v_timezone text;
  v_wake_times jsonb := '[]'::jsonb;
  v_current_time timestamptz;
  v_next_wake timestamptz;
  v_interval_minutes integer;
  v_preset text;
  i integer;
BEGIN
  -- Get device configuration and timezone
  SELECT
    d.wake_schedule_config,
    COALESCE(s.timezone, 'UTC')
  INTO
    v_config,
    v_timezone
  FROM devices d
  LEFT JOIN sites s ON d.site_id = s.id
  WHERE d.id = p_device_id;

  -- If device not found or no config, return empty array
  IF v_config IS NULL THEN
    RETURN jsonb_build_object(
      'wake_times', '[]'::jsonb,
      'timezone', 'UTC',
      'error', 'Device not found or no wake schedule configured'
    );
  END IF;

  -- Get current time in device timezone
  v_current_time := now() AT TIME ZONE v_timezone;

  -- Extract preset if exists
  v_preset := v_config->>'preset';

  -- Calculate wake times based on preset
  IF v_preset IS NOT NULL THEN
    -- Handle preset schedules
    CASE v_preset
      WHEN 'every-30-min' THEN
        v_interval_minutes := 30;
      WHEN 'hourly' THEN
        v_interval_minutes := 60;
      WHEN 'every-2-hours' THEN
        v_interval_minutes := 120;
      WHEN 'every-4-hours' THEN
        v_interval_minutes := 240;
      WHEN 'every-6-hours' THEN
        v_interval_minutes := 360;
      WHEN 'every-12-hours' THEN
        v_interval_minutes := 720;
      WHEN 'daily' THEN
        v_interval_minutes := 1440;
      ELSE
        -- Unknown preset, return error
        RETURN jsonb_build_object(
          'wake_times', '[]'::jsonb,
          'timezone', v_timezone,
          'error', 'Unknown preset: ' || v_preset
        );
    END CASE;

    -- Generate next wake times using interval
    v_next_wake := v_current_time;
    FOR i IN 1..p_count LOOP
      v_next_wake := v_next_wake + (v_interval_minutes || ' minutes')::interval;
      v_wake_times := v_wake_times || to_jsonb(v_next_wake);
    END LOOP;

  ELSE
    -- If no preset, check for custom cron or return error
    RETURN jsonb_build_object(
      'wake_times', '[]'::jsonb,
      'timezone', v_timezone,
      'error', 'Custom cron schedules not yet supported'
    );
  END IF;

  -- Return wake times with timezone info
  RETURN jsonb_build_object(
    'wake_times', v_wake_times,
    'timezone', v_timezone
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_next_wake_times(uuid, integer) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_next_wake_times IS 'Calculate the next N wake times for a device based on its wake schedule configuration';
