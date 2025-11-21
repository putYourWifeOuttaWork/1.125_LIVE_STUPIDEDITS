# 🔧 Apply Snapshot Function - CORRECTED VERSION

## ✅ Step 1: Copy This SQL

**IMPORTANT:** Use this corrected version (matches your actual database schema)

The SQL is also available in: `/tmp/snapshot_function_corrected.sql`

Copy and paste this entire block into Supabase SQL Editor:

```sql
-- Fix session wake snapshot generation
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
  v_active_devices_count integer := 0;
  v_new_images_count integer := 0;
  v_new_alerts_count integer := 0;
BEGIN
  SELECT site_id, program_id, company_id
  INTO v_site_id, v_program_id, v_company_id
  FROM site_device_sessions
  WHERE session_id = p_session_id;

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  SELECT COUNT(*) INTO v_active_devices_count
  FROM devices WHERE site_id = v_site_id AND is_active = true;

  SELECT COUNT(DISTINCT dwp.image_id) INTO v_new_images_count
  FROM device_wake_payloads dwp
  JOIN devices d ON d.device_id = dwp.device_id
  WHERE d.site_id = v_site_id
    AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
    AND dwp.image_id IS NOT NULL;

  SELECT COUNT(*) INTO v_new_alerts_count
  FROM device_alerts da
  JOIN devices d ON d.device_id = da.device_id
  WHERE d.site_id = v_site_id
    AND da.triggered_at BETWEEN p_wake_round_start AND p_wake_round_end;

  WITH device_data AS (
    SELECT
      d.device_id, d.device_code, d.device_name, d.device_mac,
      d.x_position, d.y_position, d.zone_id, d.zone_label,
      d.is_active, d.battery_voltage, d.battery_health_percent, d.last_seen_at,
      (SELECT dwp.temperature FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_temp,
      (SELECT dwp.humidity FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_humidity,
      (SELECT dwp.pressure FROM device_wake_payloads dwp
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_pressure,
      (SELECT di.mgi_score FROM device_images di
       JOIN device_wake_payloads dwp ON dwp.image_id = di.image_id
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
         AND di.mgi_score IS NOT NULL
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_mgi,
      (SELECT di.mgi_velocity FROM device_images di
       JOIN device_wake_payloads dwp ON dwp.image_id = di.image_id
       WHERE dwp.device_id = d.device_id
         AND dwp.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
         AND di.mgi_velocity IS NOT NULL
       ORDER BY dwp.captured_at DESC LIMIT 1) as latest_mgi_velocity
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
                'latest_humidity', dd.latest_humidity,
                'latest_pressure', dd.latest_pressure
              )
            ELSE NULL
          END,
          'mgi_state', CASE
            WHEN dd.latest_mgi IS NOT NULL THEN
              jsonb_build_object(
                'latest_mgi_score', dd.latest_mgi,
                'mgi_velocity', dd.latest_mgi_velocity
              )
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

  INSERT INTO session_wake_snapshots (
    company_id, program_id, site_id, session_id,
    wake_number, wake_round_start, wake_round_end, site_state,
    active_devices_count, new_images_this_round, new_alerts_this_round
  ) VALUES (
    v_company_id, v_program_id, v_site_id, p_session_id,
    p_wake_number, p_wake_round_start, p_wake_round_end, v_site_state,
    v_active_devices_count, v_new_images_count, v_new_alerts_count
  )
  ON CONFLICT (session_id, wake_number)
  DO UPDATE SET
    site_state = EXCLUDED.site_state,
    active_devices_count = EXCLUDED.active_devices_count,
    new_images_this_round = EXCLUDED.new_images_this_round,
    new_alerts_this_round = EXCLUDED.new_alerts_this_round,
    wake_round_start = EXCLUDED.wake_round_start,
    wake_round_end = EXCLUDED.wake_round_end,
    created_at = now()
  RETURNING snapshot_id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;
```

## ✅ Step 2: Run in Supabase
1. Supabase Dashboard → SQL Editor
2. New Query → Paste SQL → Run
3. Should see: "Success. No rows returned"

## ✅ Step 3: Generate Snapshots
```bash
node regenerate-snapshots-for-site.mjs
```

## ✅ Step 4: View Timeline Playback
Open "Iot Test Site 2" in your app!
