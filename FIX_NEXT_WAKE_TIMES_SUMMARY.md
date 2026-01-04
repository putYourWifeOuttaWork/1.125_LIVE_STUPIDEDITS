# Fix: Next Wake Times Column Error

## Problem
The "Next Wake Times" feature in the Device Edit Modal was showing the error:
```
column s.id does not exist
```

## Root Cause
The `get_next_wake_times()` database function had incorrect column references:
- Used `s.id` instead of `s.site_id` (sites table primary key is `site_id`)
- Used `d.id` instead of `d.device_id` (devices table primary key is `device_id`)

## Fix Applied

### Files Updated
1. **APPLY_WAKE_TIMES_MIGRATION.sql** - Updated with correct column names
2. **fix-next-wake-times-columns.sql** - New file with the corrected migration

### Changes Made
```sql
-- BEFORE (incorrect):
FROM devices d
LEFT JOIN sites s ON d.site_id = s.id      -- ❌ s.id doesn't exist
WHERE d.id = p_device_id;                  -- ❌ d.id doesn't exist

-- AFTER (correct):
FROM devices d
LEFT JOIN sites s ON d.site_id = s.site_id  -- ✅ correct
WHERE d.device_id = p_device_id;            -- ✅ correct
```

## To Deploy

### Option 1: Apply via Supabase Dashboard (Recommended)
1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy the contents of `fix-next-wake-times-columns.sql`
4. Run the SQL

### Option 2: Quick SQL Copy
```sql
DROP FUNCTION IF EXISTS get_next_wake_times(uuid, integer);

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
  SELECT
    d.wake_schedule_config,
    COALESCE(s.timezone, 'UTC')
  INTO
    v_config,
    v_timezone
  FROM devices d
  LEFT JOIN sites s ON d.site_id = s.site_id
  WHERE d.device_id = p_device_id;

  IF v_config IS NULL THEN
    RETURN jsonb_build_object(
      'wake_times', '[]'::jsonb,
      'timezone', 'UTC',
      'error', 'Device not found or no wake schedule configured'
    );
  END IF;

  v_current_time := now() AT TIME ZONE v_timezone;
  v_preset := v_config->>'preset';

  IF v_preset IS NOT NULL THEN
    CASE v_preset
      WHEN 'every-30-min' THEN v_interval_minutes := 30;
      WHEN 'hourly' THEN v_interval_minutes := 60;
      WHEN 'every-2-hours' THEN v_interval_minutes := 120;
      WHEN 'every-4-hours' THEN v_interval_minutes := 240;
      WHEN 'every-6-hours' THEN v_interval_minutes := 360;
      WHEN 'every-12-hours' THEN v_interval_minutes := 720;
      WHEN 'daily' THEN v_interval_minutes := 1440;
      ELSE
        RETURN jsonb_build_object(
          'wake_times', '[]'::jsonb,
          'timezone', v_timezone,
          'error', 'Unknown preset: ' || v_preset
        );
    END CASE;

    v_next_wake := v_current_time;
    FOR i IN 1..p_count LOOP
      v_next_wake := v_next_wake + (v_interval_minutes || ' minutes')::interval;
      v_wake_times := v_wake_times || to_jsonb(v_next_wake);
    END LOOP;
  ELSE
    RETURN jsonb_build_object(
      'wake_times', '[]'::jsonb,
      'timezone', v_timezone,
      'error', 'Custom cron schedules not yet supported'
    );
  END IF;

  RETURN jsonb_build_object(
    'wake_times', v_wake_times,
    'timezone', v_timezone
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_wake_times(uuid, integer) TO authenticated;
```

## Testing
After deploying:
1. Open the Device Edit Modal for any device
2. Set or verify a wake schedule (e.g., "Every hour")
3. The "Next Wake Times" section should now display correctly
4. Click "Refresh" to reload the wake times

## Build Status
✅ Project builds successfully with this fix
