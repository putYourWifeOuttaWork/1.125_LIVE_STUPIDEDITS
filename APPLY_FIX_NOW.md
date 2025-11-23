# 🔴 APPLY THIS FIX NOW TO RESTORE IMAGE UPLOADS

## Quick Fix (2 minutes)

### Step 1: Open Supabase SQL Editor
Click here: **https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new**

### Step 2: Copy This SQL

Open the file `FIX_DEVICE_IMAGES_INSERT.sql` in your project, or copy from below:

<details>
<summary>Click to show SQL (or use the file)</summary>

```sql
CREATE OR REPLACE FUNCTION fn_wake_ingestion_handler(
  p_device_id UUID,
  p_captured_at TIMESTAMPTZ,
  p_image_name TEXT,
  p_telemetry_data JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_company_id UUID;
  v_program_id UUID;
  v_site_id UUID;
  v_session_id UUID;
  v_session_date DATE;
  v_wake_index INT;
  v_is_overage BOOLEAN;
  v_cron_expression TEXT;
  v_payload_id UUID;
  v_image_id UUID;
BEGIN
  -- Step 1: Resolve lineage
  SELECT
    dsa.site_id,
    s.program_id,
    p.company_id,
    d.wake_schedule_cron
  INTO v_site_id, v_program_id, v_company_id, v_cron_expression
  FROM devices d
  JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
  JOIN sites s ON dsa.site_id = s.site_id
  JOIN pilot_programs p ON s.program_id = p.program_id
  WHERE d.device_id = p_device_id
    AND dsa.is_active = TRUE
    AND dsa.is_primary = TRUE;

  IF v_site_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Device not assigned to active site'
    );
  END IF;

  -- Get session date from captured_at
  v_session_date := DATE(p_captured_at);

  -- Get or create session
  SELECT session_id INTO v_session_id
  FROM site_device_sessions
  WHERE site_id = v_site_id
    AND session_date = v_session_date;

  IF v_session_id IS NULL THEN
    -- Create session on-the-fly (handles late wakes)
    INSERT INTO site_device_sessions (
      company_id, program_id, site_id,
      session_date, session_start_time, session_end_time,
      expected_wake_count, status
    ) VALUES (
      v_company_id, v_program_id, v_site_id,
      v_session_date,
      DATE_TRUNC('day', p_captured_at),
      DATE_TRUNC('day', p_captured_at) + INTERVAL '1 day',
      0, 'in_progress'
    )
    RETURNING session_id INTO v_session_id;
  END IF;

  -- Step 2: Infer wake window index
  SELECT wake_index, is_overage
  INTO v_wake_index, v_is_overage
  FROM fn_infer_wake_window_index(p_captured_at, v_cron_expression);

  -- Step 3: Create device_wake_payloads
  INSERT INTO device_wake_payloads (
    company_id, program_id, site_id, site_device_session_id, device_id,
    captured_at, wake_window_index, overage_flag,
    temperature, humidity, pressure, gas_resistance, battery_voltage, wifi_rssi,
    telemetry_data, image_status, payload_status
  ) VALUES (
    v_company_id, v_program_id, v_site_id, v_session_id, p_device_id,
    p_captured_at, v_wake_index, v_is_overage,
    (p_telemetry_data->>'temperature')::NUMERIC,
    (p_telemetry_data->>'humidity')::NUMERIC,
    (p_telemetry_data->>'pressure')::NUMERIC,
    (p_telemetry_data->>'gas_resistance')::NUMERIC,
    (p_telemetry_data->>'battery_voltage')::NUMERIC,
    (p_telemetry_data->>'wifi_rssi')::INT,
    p_telemetry_data,
    'pending', 'pending'
  )
  RETURNING payload_id INTO v_payload_id;

  -- Step 4: Create device_images row
  -- ✅ FIX: Include program_id, site_id, site_device_session_id so trigger doesn't error
  INSERT INTO device_images (
    device_id,
    image_name,
    captured_at,
    status,
    total_chunks,
    metadata,
    company_id,
    original_capture_date,
    program_id,                    -- ✅ ADD: Resolved from lineage
    site_id,                       -- ✅ ADD: Resolved from lineage
    site_device_session_id         -- ✅ ADD: Resolved/created above
  ) VALUES (
    p_device_id,
    p_image_name,
    p_captured_at,
    'receiving',
    (p_telemetry_data->>'total_chunks')::INT,
    p_telemetry_data,
    v_company_id,
    v_session_date,
    v_program_id,                  -- ✅ ADD: Pass resolved value
    v_site_id,                     -- ✅ ADD: Pass resolved value
    v_session_id                   -- ✅ ADD: Pass session_id
  )
  ON CONFLICT (device_id, image_name) DO UPDATE
  SET captured_at = EXCLUDED.captured_at,
      metadata = EXCLUDED.metadata,
      program_id = EXCLUDED.program_id,          -- ✅ UPDATE on conflict
      site_id = EXCLUDED.site_id,                -- ✅ UPDATE on conflict
      site_device_session_id = EXCLUDED.site_device_session_id,  -- ✅ UPDATE on conflict
      updated_at = NOW()
  RETURNING image_id INTO v_image_id;

  -- Link image to payload
  UPDATE device_wake_payloads
  SET image_id = v_image_id,
      image_status = 'receiving'
  WHERE payload_id = v_payload_id;

  -- Step 5: Update session counters if overage
  IF v_is_overage THEN
    UPDATE site_device_sessions
    SET extra_wake_count = extra_wake_count + 1
    WHERE session_id = v_session_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payload_id', v_payload_id,
    'image_id', v_image_id,
    'session_id', v_session_id,
    'wake_index', v_wake_index,
    'is_overage', v_is_overage
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

</details>

### Step 3: Paste and Run
1. Paste the SQL into the editor
2. Click **"Run"** button
3. Should see: "Success. No rows returned"

### Step 4: Test
Send a test message from your device or simulator. Should now work without the `site_device_session_id` error!

---

## What This Fixes

**Before (Broken):**
- Function had `v_program_id`, `v_site_id`, `v_session_id` variables
- But didn't include them in the INSERT
- Trigger tried to check `NEW.site_device_session_id`
- PostgreSQL error: "record has no field..."

**After (Fixed):**
- Function passes all three IDs to INSERT
- Trigger can properly check and inherit values
- Image records created with full context
- ✅ Device uploads work!

---

## Verification

After applying, your logs should show:
```
[METADATA] Received for image ...
[METADATA] Inserting image record with metadata: {...}
✅ [SUCCESS] Image record created: {image_id}
```

Instead of:
```
❌ [ERROR] record "new" has no field "site_device_session_id"
```

---

## Why This Fix Is Correct

Per ESP32-CAM Protocol (Section 5 of PDF):
- Device sends: MAC, telemetry, image_name
- Server resolves: company_id, program_id, site_id, session_id

The function WAS resolving these correctly, it just wasn't passing them to the INSERT statement. Now it does!
