# CRITICAL FIX: Device Telemetry Context Inheritance

## Problem Identified

When device telemetry comes in via MQTT (without images), the `device_telemetry` table is being populated with **NULL values** for critical foreign keys:
- `program_id` = NULL ❌
- `site_id` = NULL ❌
- `site_device_session_id` = NULL ❌
- `wake_payload_id` = NULL ❌

This breaks:
- Session tracking and rollups
- Snapshot generation
- Site map visualizations
- All analytics that depend on device context

## Root Cause

In `supabase/functions/mqtt_device_handler/ingest.ts`, the `handleTelemetryOnly()` function (lines 475-487) only inserts:
- `device_id` ✅
- `company_id` ✅
- Sensor values ✅

But **ignores** the `lineageData` which contains:
- `site_id`
- `program_id`
- Active session context

## Evidence

**Device Record** (has complete context):
```json
{
  "device_id": "15207d5d-1c32-4559-a3e8-216cee867527",
  "site_id": "134218af-9afc-4ee9-9244-050f51ccbb39",
  "program_id": "6aa78f0f-6173-44e8-bc6c-877c775e2622",
  "company_id": "743d51b9-17bf-43d5-ad22-deebafead6fa"
}
```

**Telemetry Record Created** (missing context):
```json
{
  "telemetry_id": "27d5db36-21a4-44e6-8429-8ce726e74a82",
  "device_id": "15207d5d-1c32-4559-a3e8-216cee867527",
  "company_id": "743d51b9-17bf-43d5-ad22-deebafead6fa",
  "program_id": null,  // ❌ SHOULD BE POPULATED
  "site_id": null,     // ❌ SHOULD BE POPULATED
  "site_device_session_id": null,  // ❌ SHOULD BE POPULATED
  "wake_payload_id": null          // ⚠️ OK for telemetry-only
}
```

## Solution

### Step 1: Update Edge Function to Populate Context

The `handleTelemetryOnly()` function must:
1. Use the lineage data it already fetches
2. Look up the active session for the site
3. Populate ALL available foreign keys

### Step 2: Add Helper Function to Get Active Session

Create a database function to get the current active session for a site:

```sql
CREATE OR REPLACE FUNCTION fn_get_active_session_for_site(p_site_id UUID)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  SELECT session_id
  INTO v_session_id
  FROM site_device_sessions
  WHERE site_id = p_site_id
    AND status = 'active'
  ORDER BY session_start_time DESC
  LIMIT 1;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_get_active_session_for_site(UUID) TO service_role;
```

### Step 3: Update Telemetry Insert

Change the insert in `ingest.ts` line 475-487 from:

```typescript
const { error: insertError } = await supabase
  .from('device_telemetry')
  .insert({
    device_id: lineageData.device_id,
    company_id: lineageData.company_id,
    captured_at: capturedAt,
    temperature: payload.temperature,
    humidity: payload.humidity,
    pressure: payload.pressure,
    gas_resistance: payload.gas_resistance,
    battery_voltage: payload.battery_voltage,
    wifi_rssi: payload.wifi_rssi,
  });
```

To:

```typescript
// Get active session for the site (if exists)
let sessionId = null;
if (lineageData.site_id) {
  const { data: sessionData } = await supabase.rpc(
    'fn_get_active_session_for_site',
    { p_site_id: lineageData.site_id }
  );
  sessionId = sessionData;
}

const { error: insertError } = await supabase
  .from('device_telemetry')
  .insert({
    device_id: lineageData.device_id,
    company_id: lineageData.company_id,
    program_id: lineageData.program_id,      // ✅ ADD THIS
    site_id: lineageData.site_id,            // ✅ ADD THIS
    site_device_session_id: sessionId,       // ✅ ADD THIS
    wake_payload_id: null,                   // OK - telemetry only has no wake payload
    captured_at: capturedAt,
    temperature: payload.temperature,
    humidity: payload.humidity,
    pressure: payload.pressure,
    gas_resistance: payload.gas_resistance,
    battery_voltage: payload.battery_voltage,
    wifi_rssi: payload.wifi_rssi,
  });
```

## Files to Update

1. **Create Migration**: `/tmp/cc-agent/51386994/project/supabase/migrations/YYYYMMDD_fix_telemetry_context.sql`
   - Add `fn_get_active_session_for_site()` helper

2. **Update Edge Function**: `/tmp/cc-agent/51386994/project/supabase/functions/mqtt_device_handler/ingest.ts`
   - Modify `handleTelemetryOnly()` function (line 475-487)
   - Also check `handleHelloStatus()` telemetry insert (line 186-201)

## Testing

After applying fix, send test telemetry:

```json
{
  "device_id": "AA:BB:CC:DD:EE:22",
  "capture_timestamp": "2025-11-21T20:30:00Z",
  "temperature": 25.5,
  "humidity": 65.0,
  "pressure": 1013.0,
  "gas_resistance": 20.0,
  "battery_voltage": 3.85,
  "wifi_rssi": -55
}
```

Verify record has:
- ✅ `program_id` populated
- ✅ `site_id` populated
- ✅ `site_device_session_id` populated (if active session exists)
- ✅ `company_id` populated

## Impact

This fix ensures:
- 📊 Telemetry appears in snapshots
- 🗺️ Site maps show real-time data
- 📈 Analytics include all device data
- 🎯 Session rollups are accurate
- ⚡ Device context fully tracked

## Priority: CRITICAL

Without this fix, telemetry data is **orphaned** and cannot be:
- Associated with sessions
- Included in snapshots
- Visualized on site maps
- Used in analytics
- Rolled up for reporting

**Status**: Ready to implement
