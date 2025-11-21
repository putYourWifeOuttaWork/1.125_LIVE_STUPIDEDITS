# 🔧 Apply Snapshot Function Fix - REQUIRED

The Timeline Playback visualization needs the `generate_session_wake_snapshot()` function to be created in your database.

## ✅ Quick Fix (2 minutes)

### Step 1: Copy the SQL
Open this file and copy ALL the SQL:
```
/tmp/snapshot_function_only.sql
```

OR copy from below:

```sql
-- Fix session wake snapshot generation to query device_wake_payloads properly

DROP FUNCTION IF EXISTS generate_session_wake_snapshot(uuid, integer, timestamptz, timestamptz);

CREATE FUNCTION generate_session_wake_snapshot(
  p_session_id uuid,
  p_wake_number integer,
  p_wake_round_start timestamptz,
  p_wake_round_end timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot_id uuid;
  v_site_id uuid;
  v_program_id uuid;
  v_company_id uuid;
  v_site_state jsonb;
BEGIN
  -- Get session context
  SELECT site_id, program_id, company_id
  INTO v_site_id, v_program_id, v_company_id
  FROM site_device_sessions
  WHERE session_id = p_session_id;

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  -- Build site state from device_wake_payloads
  WITH device_data AS (
    SELECT
      d.device_id,
      d.device_code,
      d.device_name,
      d.device_mac,
      d.x_position,
      d.y_position,
      d.zone_id,
      d.zone_label,
      d.is_active,
      d.battery_voltage,
      d.battery_health_percent,
      d.last_seen_at,
      (SELECT dwp.temperature FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_temp,
      (SELECT dwp.humidity FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_humidity,
      (SELECT di.mgi_score FROM device_images di
       JOIN device_wake_payloads dwp ON dwp.image_id = di.image_id
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
         AND di.mgi_score IS NOT NULL
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_mgi
    FROM devices d
    WHERE d.site_id = v_site_id AND d.is_active = true
  )
  SELECT jsonb_build_object(
    'devices', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'device_id', dd.device_id,
          'device_code', dd.device_code,
          'device_name', dd.device_name,
          'device_mac', dd.device_mac,
          'position', jsonb_build_object('x', dd.x_position, 'y', dd.y_position),
          'zone_id', dd.zone_id,
          'zone_label', dd.zone_label,
          'status', CASE WHEN dd.is_active THEN 'active' ELSE 'inactive' END,
          'battery_voltage', dd.battery_voltage,
          'battery_health_percent', dd.battery_health_percent,
          'last_seen_at', dd.last_seen_at,
          'telemetry', CASE
            WHEN dd.latest_temp IS NOT NULL THEN
              jsonb_build_object(
                'latest_temperature', dd.latest_temp,
                'latest_humidity', dd.latest_humidity
              )
            ELSE NULL
          END,
          'mgi_state', CASE
            WHEN dd.latest_mgi IS NOT NULL THEN
              jsonb_build_object('latest_mgi_score', dd.latest_mgi)
            ELSE NULL
          END,
          'display', jsonb_build_object(
            'color', CASE
              WHEN dd.latest_mgi >= 0.6 THEN '#EF4444'
              WHEN dd.latest_mgi >= 0.4 THEN '#F59E0B'
              WHEN dd.latest_mgi IS NOT NULL THEN '#10B981'
              ELSE '#10B981'
            END,
            'shape', 'circle',
            'size', 'medium'
          )
        )
      )
      FROM device_data dd
    )
  ) INTO v_site_state;

  -- Insert snapshot
  INSERT INTO session_wake_snapshots (
    company_id, program_id, site_id, session_id,
    wake_number, snapshot_timestamp, site_state
  ) VALUES (
    v_company_id, v_program_id, v_site_id, p_session_id,
    p_wake_number, p_wake_round_start, v_site_state
  )
  ON CONFLICT (session_id, wake_number)
  DO UPDATE SET
    site_state = EXCLUDED.site_state,
    updated_at = now()
  RETURNING snapshot_id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;
```

### Step 2: Apply in Supabase Dashboard
1. Go to Supabase Dashboard → **SQL Editor**
2. Click "+ New Query"
3. Paste the SQL
4. Click **"Run"**
5. You should see: ✅ "Success. No rows returned"

### Step 3: Generate Snapshots
Run this command:
```bash
node regenerate-snapshots-for-site.mjs
```

### Step 4: View Timeline Playback
Open your app and navigate to the Timeline Playback for "Iot Test Site 2". You should now see:
- Device dots with colors (green → orange → red based on MGI)
- Temperature and humidity values
- Animated visualization working

---

## 🎯 What This Does
- Creates the `generate_session_wake_snapshot()` function
- Queries `device_wake_payloads` table for real telemetry data
- Pre-computes display colors for visualization layers
- Enables the Timeline Playback feature

## ❓ Need Help?
If you see errors, share the error message and I'll help debug!
