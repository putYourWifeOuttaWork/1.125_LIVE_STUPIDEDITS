# Deploy Alert System Fix - Quick Guide

## Files Ready for Deployment

### 1. SQL Migration ✅
**Location**: `/tmp/cc-agent/51386994/project/APPLY_TEMPERATURE_FIX_FOR_ALERTS.sql`

**What it does**:
- Converts GENERATED temperature column → regular NUMERIC column
- Backfills existing data (Celsius → Fahrenheit)
- Creates safety trigger for future inserts
- No data loss, safe to apply

**Deploy via Supabase SQL Editor**:
```
1. Open: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql
2. Copy entire contents of: APPLY_TEMPERATURE_FIX_FOR_ALERTS.sql
3. Paste and click "Run"
4. Wait for success message
```

### 2. Edge Function (Already Updated) ✅
**Location**: `/tmp/cc-agent/51386994/project/supabase/functions/mqtt_device_handler_bundled/index.ts`

**Temperature conversion found at**:
- Line 625: `function celsiusToFahrenheit()` definition
- Line 868: HELLO handler - converts temperature
- Line 1213: Telemetry handler - converts temperature

**Status**: Already has temperature conversion logic! This version includes:
- ✅ `celsiusToFahrenheit()` function
- ✅ Conversion in HELLO status handler
- ✅ Conversion in telemetry-only handler
- ✅ Pending image list processing (v3.5.0)
- ✅ Firmware protocol normalization

**No edge function redeployment needed** - it's already correct!

## Deployment Steps

### Step 1: Apply SQL Migration (REQUIRED)

1. Open Supabase SQL Editor
2. Copy the entire file: `APPLY_TEMPERATURE_FIX_FOR_ALERTS.sql`
3. Paste into SQL Editor
4. Click "Run"
5. Verify output shows:
   ```
   NOTICE: Dropped generated temperature column
   NOTICE: Temperature Migration Complete
   NOTICE: Alert system is now ready!
   ```

### Step 2: Verify Temperature Values

Run this query to check conversion worked:

```sql
-- Check recent temperature values (should be in Fahrenheit 50-90°F range)
SELECT
  device_id,
  captured_at,
  temperature,
  humidity,
  metadata->>'temperature' as metadata_temp
FROM device_images
WHERE temperature IS NOT NULL
ORDER BY captured_at DESC
LIMIT 10;
```

Expected: temperature values between 50-90°F for normal conditions

### Step 3: Test Alert System

```sql
-- Check alert thresholds are configured
SELECT
  d.device_name,
  dt.threshold_type,
  dt.threshold_value,
  dt.threshold_unit
FROM device_thresholds dt
JOIN devices d ON d.device_id = dt.device_id
WHERE dt.threshold_type LIKE '%temperature%';
```

### Step 4: Monitor Alerts

```sql
-- Check for recent alerts
SELECT
  da.triggered_at,
  d.device_name,
  da.alert_type,
  da.severity,
  da.message
FROM device_alerts da
JOIN devices d ON d.device_id = da.device_id
WHERE da.triggered_at > NOW() - INTERVAL '1 hour'
ORDER BY da.triggered_at DESC;
```

## Why Only SQL Migration?

Your edge function at `supabase/functions/mqtt_device_handler_bundled/index.ts` already has:

1. **Temperature Conversion Function** (line 625):
   ```typescript
   function celsiusToFahrenheit(celsius: number | null | undefined): number | null {
     if (celsius === null || celsius === undefined) return null;
     if (celsius < -40 || celsius > 85) {
       console.warn(`[Temperature] Out of range Celsius value: ${celsius}°C`);
     }
     const fahrenheit = (celsius * 1.8) + 32;
     return Math.round(fahrenheit * 100) / 100;
   }
   ```

2. **Conversion in HELLO Handler** (line 868):
   ```typescript
   temperature: celsiusToFahrenheit(payload.temperature),
   ```

3. **Conversion in Telemetry Handler** (line 1213):
   ```typescript
   temperature: celsiusToFahrenheit(payload.temperature),
   ```

The only missing piece was the database schema - the GENERATED column prevented alerts from working!

## What Happens After Migration

1. **Device sends**: Temperature in Celsius (e.g., 22°C)
2. **Edge function**: Converts to Fahrenheit (e.g., 72°F)
3. **Database**: Stores 72°F in regular column
4. **Alert system**: Compares 72°F vs threshold (e.g., 85°F)
5. **Result**: Alert triggers if threshold exceeded

## Troubleshooting

### Issue: Temperature still in Celsius after migration

**Check**:
```sql
SELECT temperature
FROM device_images
WHERE captured_at > NOW() - INTERVAL '1 hour'
ORDER BY captured_at DESC
LIMIT 5;
```

If values are < 50, manually backfill:
```sql
UPDATE device_images
SET temperature = (temperature * 1.8) + 32
WHERE temperature < 50 AND temperature IS NOT NULL;
```

### Issue: Alerts not triggering

**Verify**:
1. ✅ SQL migration applied
2. ✅ Temperature values in Fahrenheit (50-90°F)
3. ✅ Thresholds configured in Fahrenheit
4. ✅ Edge function deployed (already correct)

**Test manually**:
```sql
SELECT check_absolute_thresholds(
  '<device_id>'::uuid,
  75.0,  -- temperature in Fahrenheit
  65.0,  -- humidity
  NULL,  -- MGI
  NOW()
);
```

## Summary

**Ready to deploy**:
- ✅ SQL Migration: `APPLY_TEMPERATURE_FIX_FOR_ALERTS.sql`
- ✅ Edge Function: Already correct (no changes needed)

**Action required**:
1. Apply SQL migration (5 minutes)
2. Run verification queries (2 minutes)
3. Monitor alerts (ongoing)

**Total time**: 10 minutes
**Risk**: Low (safe migration, no data loss)
**Downtime**: None

Your alert generation system will be fully operational after the SQL migration!
