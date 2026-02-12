# Alert System Temperature Fix - Implementation Guide

## Problem Summary

Temperature-based alerts were not triggering despite readings exceeding thresholds. Root cause: **temperature unit mismatch**.

- **Alert thresholds**: Configured in Fahrenheit (e.g., Max Warning: 70°F)
- **Temperature values being checked**: Sent in Celsius (~24°C)
- **Result**: 24°C compared against 70°F threshold never triggers

## Fixes Applied

### 1. Edge Function Temperature Conversion (COMPLETED)
**File**: `supabase/functions/mqtt_device_handler/ingest.ts`

**Changes**:
- Line 865: Added `celsiusToFahrenheit()` conversion before alert checking
- Line 868-877: Updated `check_absolute_thresholds` RPC to use Fahrenheit
- Line 890-898: Added `check_combination_zones` RPC call (was missing)

**Impact**: All future telemetry will trigger alerts correctly

### 2. Database Computed Columns Fix (READY TO APPLY)
**File**: `fix-device-images-temperature.sql`

**Changes**:
- Updates `device_images` table computed column defaults
- Extracts `metadata->>'temperature_fahrenheit'` instead of Celsius
- Adds fallback conversion: `(celsius * 1.8) + 32`
- Creates trigger to ensure all future inserts use Fahrenheit
- Backfills ~33 historical rows with correct temperatures

**To Apply**:
```bash
# Run this SQL script in your Supabase SQL Editor
psql $DATABASE_URL -f fix-device-images-temperature.sql

# OR via Supabase dashboard:
# 1. Go to SQL Editor
# 2. Copy contents of fix-device-images-temperature.sql
# 3. Execute
```

### 3. Edge Function Deployment (REQUIRED)
**Function**: `mqtt_device_handler`

**To Deploy**:
```bash
# Option 1: Via Supabase CLI
supabase functions deploy mqtt_device_handler

# Option 2: Via Dashboard
# 1. Go to Edge Functions
# 2. Select mqtt_device_handler
# 3. Click "Deploy"
```

## Verification Steps

### 1. Check Temperature Values
Run this query to verify temperatures are now in Fahrenheit:

```sql
SELECT
  image_id,
  temperature as temp_f,
  (metadata->>'temperature')::numeric as metadata_celsius,
  (metadata->>'temperature_fahrenheit')::numeric as metadata_f,
  captured_at
FROM device_images
WHERE captured_at > NOW() - INTERVAL '1 day'
ORDER BY captured_at DESC
LIMIT 10;
```

Expected: `temp_f` column shows 70-80°F range, not 20-30°C range

### 2. Check Alert Thresholds
Verify your company thresholds:

```sql
SELECT
  company_id,
  temp_max_warning,
  temp_max_critical,
  rh_max_warning,
  is_active
FROM device_alert_thresholds
WHERE device_id IS NULL  -- Company defaults
  AND is_active = true;
```

Expected output:
- `temp_max_warning`: 70
- `temp_max_critical`: 90

### 3. Trigger Test Alert
After deployment, simulate an alert:

```sql
-- Call alert function with high temperature
SELECT * FROM check_absolute_thresholds(
  p_device_id := 'YOUR_DEVICE_ID_HERE'::uuid,
  p_temperature := 77.0,  -- Above 70°F warning threshold
  p_humidity := 52.0,
  p_mgi := NULL,
  p_measurement_timestamp := NOW()
);
```

Expected: Returns array with warning alert details

### 4. Check Alert Generation
After the next telemetry reading:

```sql
SELECT
  alert_id,
  alert_type,
  severity,
  message,
  actual_value,
  threshold_value,
  triggered_at
FROM device_alerts
WHERE triggered_at > NOW() - INTERVAL '1 hour'
ORDER BY triggered_at DESC;
```

Expected: See alerts where `actual_value` > 70 (your max warning)

## What Each Fix Does

### Edge Function Fix
- **Before**: `check_absolute_thresholds(temperature: 24)` vs threshold: 70°F → No alert
- **After**: `check_absolute_thresholds(temperature: 75.2)` vs threshold: 70°F → ⚠️ Alert!

### Database Fix
- **Before**: `device_images.temperature = 24` (Celsius stored)
- **After**: `device_images.temperature = 75.2` (Fahrenheit stored correctly)

### Combination Zones
- **Before**: Not checked at all
- **After**: Checks dangerous Temp+RH combinations (e.g., 70°F + 75% RH)

## Expected Results

Once deployed, you should see:

1. **Immediate**: New telemetry readings will trigger alerts correctly
2. **Historical Data**: Historical images will show correct Fahrenheit temperatures
3. **Alert Generation**: Automatic alerts for temperatures > 70°F
4. **Combination Alerts**: Alerts for dangerous temp+humidity combinations

## Test Scenario

Your data shows:
- **Temperature readings**: 75.42°F, 76.26°F, 76.48°F, 76.6°F, 76.66°F, 76.7°F, 76.76°F
- **Max Warning Threshold**: 70°F
- **Expected Alerts**: 7 warning-level alerts

After fixes are deployed, these readings will correctly trigger alerts.

## Rollback Plan

If issues occur:

1. **Edge Function Rollback**:
   ```bash
   # Redeploy previous version
   supabase functions deploy mqtt_device_handler --version PREVIOUS_VERSION
   ```

2. **Database Rollback**:
   ```sql
   -- Remove trigger
   DROP TRIGGER IF EXISTS ensure_fahrenheit_temperature_trigger ON device_images;
   DROP FUNCTION IF EXISTS ensure_fahrenheit_temperature();

   -- Revert to original computed column
   ALTER TABLE device_images
     ALTER COLUMN temperature
     SET DEFAULT ((metadata ->> 'temperature'::text))::numeric;
   ```

## Questions?

- **Q**: Will this affect existing data?
- **A**: Yes, the SQL migration backfills historical data with correct Fahrenheit values

- **Q**: Do I need to reconfigure alert thresholds?
- **A**: No, thresholds are already in Fahrenheit and will work correctly now

- **Q**: Will alerts be retroactive?
- **A**: No, only new readings will trigger alerts. Historical threshold breaches won't create alerts

## Next Steps

1. ✅ Review this document
2. ⏳ Apply database migration: `fix-device-images-temperature.sql`
3. ⏳ Deploy edge function: `mqtt_device_handler`
4. ⏳ Verify with test queries above
5. ⏳ Monitor alerts page for new alerts

## Support

If alerts still don't trigger after deployment:
1. Check edge function logs for errors
2. Verify database migration completed successfully
3. Confirm device is sending telemetry
4. Check company_id matches between device and thresholds
