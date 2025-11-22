# Apply Device Sessions Function

## Step 1: Apply SQL in Supabase Dashboard

Go to: **Supabase Dashboard → SQL Editor → New Query**

Paste and run this SQL:

```sql
-- Create device-only sessions function
CREATE OR REPLACE FUNCTION get_my_active_device_sessions()
RETURNS TABLE (
  session_id UUID,
  session_type TEXT,
  session_date DATE,
  site_id UUID,
  site_name TEXT,
  program_id UUID,
  program_name TEXT,
  company_id UUID,
  company_name TEXT,
  status TEXT,
  started_at TIMESTAMPTZ,
  expected_items INT,
  completed_items INT,
  progress_percent NUMERIC,
  session_metadata JSONB
) AS $$
DECLARE
  v_user_company_id UUID;
  v_is_super_admin BOOLEAN;
BEGIN
  -- Get current user's company and admin status
  SELECT u.company_id, u.is_super_admin
  INTO v_user_company_id, v_is_super_admin
  FROM users u
  WHERE u.id = auth.uid();

  -- If super-admin, check for active company context
  IF v_is_super_admin THEN
    SELECT active_company_id
    INTO v_user_company_id
    FROM user_active_company_context
    WHERE user_id = auth.uid();

    -- If no active context, show all companies
    IF v_user_company_id IS NULL THEN
      v_user_company_id := NULL; -- Show all
    END IF;
  END IF;

  -- Return device sessions only
  RETURN QUERY
  SELECT
    sds.session_id,
    'device'::TEXT as session_type,
    sds.session_date,
    sds.site_id,
    s.name as site_name,
    sds.program_id,
    p.name as program_name,
    sds.company_id,
    c.name as company_name,
    sds.status::TEXT,
    sds.session_start_time as started_at,

    -- Expected items: wake count
    sds.expected_wake_count as expected_items,

    -- Completed items: completed wake count
    sds.completed_wake_count as completed_items,

    -- Progress percentage
    CASE
      WHEN sds.expected_wake_count > 0
      THEN ROUND((sds.completed_wake_count::NUMERIC / sds.expected_wake_count::NUMERIC) * 100, 1)
      ELSE 0
    END as progress_percent,

    -- Metadata
    jsonb_build_object(
      'failed_wake_count', sds.failed_wake_count,
      'extra_wake_count', sds.extra_wake_count,
      'session_end_time', sds.session_end_time,
      'locked_at', sds.locked_at
    ) as session_metadata

  FROM site_device_sessions sds
  JOIN sites s ON sds.site_id = s.site_id
  JOIN pilot_programs p ON sds.program_id = p.program_id
  JOIN companies c ON sds.company_id = c.company_id
  WHERE sds.status = 'in_progress'
    AND (v_user_company_id IS NULL OR sds.company_id = v_user_company_id)
  ORDER BY sds.session_start_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_my_active_device_sessions() IS
'Returns active device sessions only (no human submissions).
Respects company context for regular users and super-admins.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_my_active_device_sessions() TO authenticated;
```

## Step 2: Verify It Works

After running the SQL, refresh your browser and click the Sessions button.

You should see:
- ✅ **4 active device sessions** displayed
- ✅ Tab label: "Device Sessions 🤖 4"
- ✅ Each session shows:
  - Site name
  - Program name
  - Session date
  - Progress bar (e.g., "0/37 wakes completed")
  - "View" button to navigate to detail page

## Current Sessions (from test query):

1. **Test Site for IoT Device** - 2025-11-22
   - Program: Sandhill Pilot #2 (Control)
   - Progress: 0/3 wakes

2. **Greenhouse #1** - 2025-11-22
   - Program: Sandhill Period 2
   - Progress: 0/3 wakes

3. **Iot Test Site 2** - 2025-11-22
   - Program: IoT Test Program
   - Progress: 0/37 wakes

4. **IoT Test Site** - 2025-11-22
   - Program: IoT Test Program
   - Progress: 0/32 wakes

All 4 sessions should appear in the drawer! 🎉
