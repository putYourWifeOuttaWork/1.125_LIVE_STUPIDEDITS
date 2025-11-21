# 🚨 APPLY FIXES NOW - Step by Step Guide

## Current Status

The telemetry record you're seeing (`27d5db36-21a4-44e6-8429-8ce726e74a82`) was created at `2025-11-21 20:13:38` - **BEFORE** the fixes were applied.

The fixes are ready but NOT deployed yet:
- ❌ Database migrations NOT applied
- ❌ Edge function NOT redeployed
- ✅ Code changes complete

## Step 1: Apply Database Migrations

### Migration 1: Telemetry Context Helper

Open Supabase SQL Editor and run:

```sql
-- ==========================================
-- HELPER: GET ACTIVE SESSION FOR SITE
-- ==========================================

CREATE OR REPLACE FUNCTION fn_get_active_session_for_site(p_site_id UUID)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Find the most recent active session for this site
  SELECT session_id
  INTO v_session_id
  FROM site_device_sessions
  WHERE site_id = p_site_id
    AND status IN ('active', 'in_progress')
  ORDER BY session_start_time DESC
  LIMIT 1;

  RETURN v_session_id;  -- Returns NULL if no active session

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_get_active_session_for_site error for site %: %', p_site_id, SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute to service role (used by edge functions)
GRANT EXECUTE ON FUNCTION fn_get_active_session_for_site(UUID) TO service_role, authenticated;

COMMENT ON FUNCTION fn_get_active_session_for_site(UUID) IS
'Get the currently active session for a site. Returns NULL if no active session exists. Used by edge function to populate site_device_session_id when ingesting telemetry.';
```

✅ **Expected output**: "Function created successfully"

### Migration 2: Device Images Context

Still in Supabase SQL Editor, run the complete contents of `fix-device-images-context.sql`:

```sql
-- (Copy entire file from fix-device-images-context.sql)
```

✅ **Expected output**: "Function created successfully"

## Step 2: Redeploy Edge Function

The edge function code has been updated in your repository. Deploy it:

### Option A: Using Supabase CLI (if available)

```bash
supabase functions deploy mqtt_device_handler
```

### Option B: Through Supabase Dashboard

1. Go to Supabase Dashboard → Edge Functions
2. Find `mqtt_device_handler`
3. Click "Deploy"
4. Select the latest version from your repository

### Option C: Automatic on Git Push

If your project auto-deploys:
```bash
git add .
git commit -m "Fix: Add device context inheritance to telemetry and images"
git push
```

## Step 3: Test with New Message

After deployment, send a new MQTT message:

```bash
mosquitto_pub -h your-broker \
  -t "device/AA:BB:CC:DD:EE:22/data" \
  -m '{
    "device_id": "AA:BB:CC:DD:EE:22",
    "capture_timestamp": "2025-11-21T21:00:00Z",
    "temperature": 29.5,
    "humidity": 82.0,
    "battery_voltage": 3.91,
    "wifi_rssi": -61
  }'
```

## Step 4: Verify the Fix

Check the NEW telemetry record:

```sql
SELECT
  telemetry_id,
  device_id,
  company_id,
  program_id,              -- ✅ Should have value
  site_id,                 -- ✅ Should have value
  site_device_session_id,  -- ✅ Should have value (720e945e-b304-428b-b075-1fdad8d494cc)
  temperature,
  humidity,
  battery_voltage,
  wifi_rssi,
  created_at
FROM device_telemetry
ORDER BY created_at DESC
LIMIT 1;
```

### Expected Result:

```json
{
  "telemetry_id": "new-uuid",
  "device_id": "15207d5d-1c32-4559-a3e8-216cee867527",
  "company_id": "743d51b9-17bf-43d5-ad22-deebafead6fa",
  "program_id": "6aa78f0f-6173-44e8-bc6c-877c775e2622",  ✅
  "site_id": "134218af-9afc-4ee9-9244-050f51ccbb39",     ✅
  "site_device_session_id": "720e945e-b304-428b-b075-1fdad8d494cc", ✅
  "temperature": 29.5,
  "humidity": 82.0,
  "battery_voltage": 3.91,
  "wifi_rssi": -61,
  "created_at": "2025-11-21T21:00:00..."
}
```

## Troubleshooting

### If still seeing NULLs after deployment:

1. **Check edge function deployed:**
   - Supabase Dashboard → Edge Functions → mqtt_device_handler
   - Verify "Last deployed" timestamp is recent

2. **Check database functions exist:**
   ```sql
   SELECT proname, prosrc
   FROM pg_proc
   WHERE proname = 'fn_get_active_session_for_site';
   ```
   Should return 1 row

3. **Check for edge function errors:**
   - Supabase Dashboard → Edge Functions → mqtt_device_handler → Logs
   - Look for any errors during telemetry ingestion

4. **Verify device lineage:**
   ```sql
   SELECT * FROM fn_resolve_device_lineage('AA:BB:CC:DD:EE:22');
   ```
   Should return complete lineage with no errors

## Why the Old Record Has NULLs

The telemetry record you showed me was created at `2025-11-21 20:13:38` using the **old code** that didn't populate these fields. Once you:

1. ✅ Apply the database migrations
2. ✅ Redeploy the edge function
3. ✅ Send a NEW message

The new telemetry records will have ALL fields populated correctly!

---

**Status**: Ready to apply
**Time to deploy**: ~5 minutes
**Impact**: ALL future telemetry will have complete context
