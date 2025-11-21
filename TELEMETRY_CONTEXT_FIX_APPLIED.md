# Telemetry Context Inheritance - FIXED ✅

## Problem Solved

Device telemetry records were being created with **NULL foreign keys**, breaking:
- Session tracking
- Snapshot generation
- Site map visualizations
- All analytics

## Root Cause

The MQTT handler (`mqtt_device_handler/ingest.ts`) was only populating:
- `device_id` ✅
- `company_id` ✅

But ignoring the device's lineage context:
- `program_id` ❌
- `site_id` ❌
- `site_device_session_id` ❌

## Solution Applied

### 1. Database Helper Function ✅

Created `fn_get_active_session_for_site()` in:
- **File**: `fix-telemetry-context-inheritance.sql`
- **Purpose**: Find active session for a site
- **Returns**: `session_id` or NULL (safe for INSERT)

```sql
CREATE OR REPLACE FUNCTION fn_get_active_session_for_site(p_site_id UUID)
RETURNS UUID AS $$
  -- Returns active session_id or NULL
$$;
```

### 2. Edge Function Updates ✅

Updated **3 places** in `supabase/functions/mqtt_device_handler/ingest.ts`:

#### A. `handleTelemetryOnly()` (Line 472-501)
```typescript
// Get active session for the site
let sessionId = null;
if (lineageData.site_id) {
  const { data: sessionData } = await supabase.rpc(
    'fn_get_active_session_for_site',
    { p_site_id: lineageData.site_id }
  );
  sessionId = sessionData;
}

// Insert with FULL CONTEXT
await supabase.from('device_telemetry').insert({
  device_id: lineageData.device_id,
  company_id: lineageData.company_id,
  program_id: lineageData.program_id,      // ✅ NOW POPULATED
  site_id: lineageData.site_id,            // ✅ NOW POPULATED
  site_device_session_id: sessionId,       // ✅ NOW POPULATED
  wake_payload_id: null,
  // ... sensor values
});
```

#### B. `handleHelloStatus()` (Line 185-210)
- Same pattern for HELLO message telemetry
- Includes battery and WiFi RSSI tracking

#### C. `handleMetadata()` (Line 324-353)
- Same pattern for image metadata telemetry
- Also links `wake_payload_id` when available

## Before vs After

### Before (Broken) ❌
```json
{
  "telemetry_id": "27d5db36-21a4-44e6-8429-8ce726e74a82",
  "device_id": "15207d5d-1c32-4559-a3e8-216cee867527",
  "company_id": "743d51b9-17bf-43d5-ad22-deebafead6fa",
  "program_id": null,              // ❌
  "site_id": null,                 // ❌
  "site_device_session_id": null,  // ❌
  "temperature": 28.9,
  "humidity": 83.0
}
```

### After (Fixed) ✅
```json
{
  "telemetry_id": "...",
  "device_id": "15207d5d-1c32-4559-a3e8-216cee867527",
  "company_id": "743d51b9-17bf-43d5-ad22-deebafead6fa",
  "program_id": "6aa78f0f-6173-44e8-bc6c-877c775e2622",  // ✅ FROM DEVICE
  "site_id": "134218af-9afc-4ee9-9244-050f51ccbb39",     // ✅ FROM DEVICE
  "site_device_session_id": "active-session-uuid",      // ✅ FROM LOOKUP
  "temperature": 28.9,
  "humidity": 83.0
}
```

## Deployment Steps

### Step 1: Apply Database Migration

```bash
# Copy contents of fix-telemetry-context-inheritance.sql
# Paste into Supabase SQL Editor
# Run
```

This creates the helper function.

### Step 2: Deploy Edge Function

The edge function changes are already in the codebase:
- `supabase/functions/mqtt_device_handler/ingest.ts`

Deploy with:
```bash
supabase functions deploy mqtt_device_handler
```

Or the system will auto-deploy on next push.

## Testing

Send test telemetry:

```bash
mosquitto_pub -h your-broker \
  -t "device/AA:BB:CC:DD:EE:22/data" \
  -m '{
    "device_id": "AA:BB:CC:DD:EE:22",
    "capture_timestamp": "2025-11-21T20:30:00Z",
    "temperature": 25.5,
    "humidity": 65.0,
    "battery_voltage": 3.85,
    "wifi_rssi": -55
  }'
```

Verify in database:

```sql
SELECT
  telemetry_id,
  device_id,
  company_id,
  program_id,        -- Should be populated
  site_id,           -- Should be populated
  site_device_session_id,  -- Should be populated if active session exists
  temperature,
  humidity,
  created_at
FROM device_telemetry
ORDER BY created_at DESC
LIMIT 5;
```

## Impact

Now telemetry records are properly linked and will:
- ✅ Appear in session rollups
- ✅ Be included in snapshots
- ✅ Show on site maps
- ✅ Feed into analytics
- ✅ Support proper reporting

## Files Changed

1. ✅ **Created**: `fix-telemetry-context-inheritance.sql`
   - Database helper function

2. ✅ **Updated**: `supabase/functions/mqtt_device_handler/ingest.ts`
   - `handleTelemetryOnly()` - line 472-501
   - `handleHelloStatus()` - line 185-210
   - `handleMetadata()` - line 324-353

3. ✅ **Created**: `FIX_TELEMETRY_CONTEXT_INHERITANCE.md`
   - Problem analysis and solution design

4. ✅ **Created**: `TELEMETRY_CONTEXT_FIX_APPLIED.md` (this file)
   - Complete deployment guide

## Status: READY FOR DEPLOYMENT 🚀

Both the database migration and edge function updates are complete and ready to deploy!
