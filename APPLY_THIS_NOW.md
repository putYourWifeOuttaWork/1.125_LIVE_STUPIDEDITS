# 🔧 FIX: Device Sessions Function - Type Mismatch

## The Problem
The function was returning `CHARACTER VARYING` but expecting `TEXT`, causing error:
```
Returned type character varying(100) does not match expected type text in column 5
```

## The Solution
Cast all varchar columns to TEXT explicitly.

---

## 📋 STEP 1: Apply SQL in Supabase Dashboard

**Go to:** Supabase Dashboard → SQL Editor → New Query

**Copy/paste this SQL and click RUN:**

```sql
-- Fixed Device Sessions Function with EXPLICIT CASTS
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

    IF v_user_company_id IS NULL THEN
      v_user_company_id := NULL;
    END IF;
  END IF;

  -- Return device sessions only
  RETURN QUERY
  SELECT
    sds.session_id,
    'device'::TEXT as session_type,
    sds.session_date,
    sds.site_id,
    s.name::TEXT as site_name,           -- CAST to TEXT
    sds.program_id,
    p.name::TEXT as program_name,        -- CAST to TEXT
    sds.company_id,
    c.name::TEXT as company_name,        -- CAST to TEXT
    sds.status::TEXT,
    sds.session_start_time as started_at,
    sds.expected_wake_count as expected_items,
    sds.completed_wake_count as completed_items,
    CASE
      WHEN sds.expected_wake_count > 0
      THEN ROUND((sds.completed_wake_count::NUMERIC / sds.expected_wake_count::NUMERIC) * 100, 1)
      ELSE 0
    END as progress_percent,
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

GRANT EXECUTE ON FUNCTION get_my_active_device_sessions() TO authenticated;
```

---

## ✅ STEP 2: Refresh Your Browser

After running the SQL:
1. Go back to your app
2. **Hard refresh:** Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
3. Click the **Sessions** button

You should now see:
- ✅ **4 device sessions** displayed
- ✅ Tab shows: "Device Sessions 🤖 4"
- ✅ Each session card showing:
  - Site name, Program name, Date
  - Progress bar (0/3 wakes, 0/37 wakes, etc.)
  - "View" button

---

## Expected Results

Based on current data, you should see these 4 sessions:

1. **Test Site for IoT Device** - 2025-11-22
   - Sandhill Pilot #2 (Control)
   - 0/3 wakes (0%)

2. **Greenhouse #1** - 2025-11-22
   - Sandhill Period 2
   - 0/3 wakes (0%)

3. **Iot Test Site 2** - 2025-11-22
   - IoT Test Program
   - 0/37 wakes (0%)

4. **IoT Test Site** - 2025-11-22
   - IoT Test Program
   - 0/32 wakes (0%)

🎉 **All done!** The Sessions drawer should now work perfectly!
