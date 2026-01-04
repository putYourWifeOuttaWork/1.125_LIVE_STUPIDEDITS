# Snapshot Aggregates Fix

## Problem Summary

The Device Session Detail Page was not displaying the site map despite having 20 captured images/payloads. Investigation revealed that session wake snapshots were being created but missing critical aggregated data:

- `new_images_this_round` was always 0
- `avg_temperature` was always NULL
- `avg_humidity` was always NULL
- `avg_mgi` was always NULL
- `max_mgi` was always NULL

## Root Cause

The `generate_session_wake_snapshot()` function was building detailed per-device state data but was NOT calculating site-wide aggregate metrics. The function counted images but didn't calculate temperature, humidity, and MGI aggregates across all active devices for each wake window.

## Solution

Updated the `generate_session_wake_snapshot()` function to:

1. **Added Variable Declarations** for aggregate metrics:
   - `v_avg_temperature numeric(5,2)`
   - `v_avg_humidity numeric(5,2)`
   - `v_avg_mgi numeric(5,2)`
   - `v_max_mgi numeric(5,2)`

2. **Added Temperature/Humidity Calculation**:
   ```sql
   SELECT
     AVG(temperature)::numeric(5,2),
     AVG(humidity)::numeric(5,2)
   INTO v_avg_temperature, v_avg_humidity
   FROM device_telemetry dt
   INNER JOIN devices d ON dt.device_id = d.device_id
   WHERE d.site_id = v_site_id
     AND d.is_active = true
     AND dt.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
     AND (temperature IS NOT NULL OR humidity IS NOT NULL);
   ```

3. **Added MGI Calculation**:
   ```sql
   SELECT
     AVG(mgi_score)::numeric(5,2),
     MAX(mgi_score)::numeric(5,2)
   INTO v_avg_mgi, v_max_mgi
   FROM device_images di
   INNER JOIN devices d ON di.device_id = d.device_id
   WHERE d.site_id = v_site_id
     AND d.is_active = true
     AND di.captured_at BETWEEN p_wake_round_start AND p_wake_round_end
     AND di.mgi_score IS NOT NULL;
   ```

4. **Updated INSERT Statement** to include the calculated aggregate values

## How to Apply

### Step 1: Apply the Migration

Apply the SQL migration file through Supabase Dashboard:

1. Go to Supabase Dashboard → SQL Editor
2. Open the file `20260104_fix_snapshot_aggregates.sql`
3. Copy and paste the entire SQL content
4. Click "Run" to execute

This will update the `generate_session_wake_snapshot()` function to properly calculate aggregates for all **future** snapshots.

### Step 2: Backfill Existing Snapshots

Run the backfill script to update all existing snapshots that have NULL aggregate values:

```bash
node backfill-snapshot-aggregates.mjs
```

This script will:
- Find all snapshots with NULL aggregate data
- Recalculate temperature, humidity, and MGI metrics for each snapshot's time window
- Update the snapshot records with the calculated values
- Display progress and completion statistics

## Files Created

1. **`20260104_fix_snapshot_aggregates.sql`**
   - SQL migration to update the snapshot generation function
   - Apply through Supabase Dashboard SQL Editor

2. **`backfill-snapshot-aggregates.mjs`**
   - Node.js script to recalculate and update existing snapshots
   - Run with: `node backfill-snapshot-aggregates.mjs`

3. **`diagnose-snapshot-aggregation.mjs`**
   - Diagnostic script used to identify the problem
   - Can be used to verify the fix worked correctly

## Verification

After applying both the migration and backfill:

1. **Check a sample snapshot**:
   ```sql
   SELECT
     snapshot_id,
     wake_number,
     new_images_this_round,
     avg_temperature,
     avg_humidity,
     avg_mgi,
     max_mgi
   FROM session_wake_snapshots
   WHERE session_id = '4889eee2-6836-4f52-bbe4-9391e0930f88'
   ORDER BY wake_number
   LIMIT 5;
   ```

2. **Visit the Device Session Detail Page** and verify the site map now displays with temperature/humidity/MGI data

3. **Check that future snapshots** are created with aggregate data automatically

## Impact

- ✅ Site map visualization will now display properly
- ✅ Temperature and humidity trends will be visible
- ✅ MGI metrics will be shown across time
- ✅ Analytics and reporting will have complete data
- ✅ All future snapshots will include aggregate calculations automatically

## Technical Details

### Wake Window Approach
The function uses the `p_wake_round_start` and `p_wake_round_end` parameters to define the time window for each wake cycle. Aggregates are calculated only for data within this specific time window, ensuring accurate wake-by-wake metrics.

### LOCF (Last Observation Carried Forward)
The existing per-device data still uses LOCF for individual device telemetry and MGI when devices miss their wake window. The new aggregate calculations average only the data that actually exists within the wake window - they do NOT use LOCF.

### Data Quality
- Aggregate calculations filter out NULL values
- Temperature and humidity averages only include readings where at least one value is present
- MGI calculations only include images with valid `mgi_score` values
- All aggregates are rounded to 2 decimal places for consistency
