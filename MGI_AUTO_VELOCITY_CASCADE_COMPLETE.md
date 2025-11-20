# MGI Auto-Velocity Cascade System - Complete

## Problem Identified

MGI scores from Roboflow were being stored in `petri_observations` but:
1. ❌ No automatic velocity calculation (comparing to 1 day prior)
2. ❌ Not synced to `device_images` (where snapshots look for it)
3. ❌ No cascade of calculated fields based on MGI

## Solution Implemented

### Migration: `20251120000000_auto_calculate_mgi_velocity.sql`

This migration adds **two automatic triggers** that fire when MGI is scored:

---

## Trigger 1: Auto-Calculate Velocity

### `trg_auto_calculate_mgi_velocity()` 

**Fires:** BEFORE INSERT/UPDATE on `petri_observations` when `mgi_score` changes

**Logic:**
```sql
1. Get device_id from observation
2. Find previous observation from same device
   - Same order_index (petri dish position)
   - Within 7-day window
   - Most recent before current
3. Calculate days_elapsed
4. Calculate velocity = (current_mgi - previous_mgi) / days_elapsed
5. Store in petri_observations.growth_velocity
```

**Example:**
```
Device ABC, Order Index 1:
  - Day 1: MGI = 0.25
  - Day 2: MGI = 0.35
  - Velocity = (0.35 - 0.25) / 1.0 = +0.10/day (10% growth per day)
```

---

## Trigger 2: Sync to device_images

### `trg_sync_mgi_to_device_images()`

**Fires:** AFTER INSERT/UPDATE on `petri_observations` when `mgi_score` changes

**Logic:**
```sql
1. Find linked device_images record (via observation_id)
2. Copy MGI data:
   - mgi_score
   - mgi_confidence  
   - mgi_scored_at
3. Now device snapshots can query device_images directly
```

**Why?** Device snapshot functions query `device_images` for efficiency. This keeps data in sync.

---

## Complete MGI Flow (End-to-End)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Device sends image via MQTT                                  │
│    - Chunks assembled by mqtt_device_handler                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Image uploaded to storage bucket                             │
│    - fn_image_completion_handler() called                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. petri_observation created                                    │
│    - Linked to device_images via observation_id                 │
│    - mgi_score = NULL initially                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Trigger: trigger_auto_score_mgi_image                        │
│    - Fires on device_images.status = 'complete'                 │
│    - Calls score_mgi_image edge function via pg_net             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. score_mgi_image edge function                                │
│    - Calls Roboflow API with image URL                          │
│    - Receives MGI score (1-100)                                 │
│    - Normalizes to 0.0-1.0                                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. UPDATE petri_observations SET mgi_score = 0.45              │
│    ⚡ BEFORE UPDATE: trg_auto_calculate_mgi_velocity fires      │
│    - Finds previous observation from same device                │
│    - Calculates growth_velocity                                 │
│    - Stores in same row                                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. petri_observations row saved with:                           │
│    - mgi_score = 0.45 (45%)                                     │
│    - growth_velocity = +0.06 (6% per day)                       │
│    - mgi_confidence = 0.92                                      │
│    - mgi_scored_at = NOW()                                      │
│    ⚡ AFTER UPDATE: trg_sync_mgi_to_device_images fires         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. UPDATE device_images SET:                                    │
│    - mgi_score = 0.45                                           │
│    - mgi_confidence = 0.92                                      │
│    - mgi_scored_at = NOW()                                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. Device snapshots query device_images                         │
│    - get_device_wake_snapshot() returns MGI + velocity          │
│    - SiteMapViewer shows colored nodes with pulses              │
│    - Pulse size/speed based on velocity magnitude               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Summary

### Tables Updated Automatically

**`petri_observations`**
- `mgi_score` (0.0-1.0) - Set by Roboflow edge function
- `mgi_confidence` (0.0-1.0) - Set by Roboflow
- `mgi_scored_at` (timestamp) - Set by Roboflow
- `growth_velocity` (per day) - ⚡ AUTO-CALCULATED by trigger

**`device_images`**
- `mgi_score` - ⚡ AUTO-SYNCED from petri_observations
- `mgi_confidence` - ⚡ AUTO-SYNCED from petri_observations
- `mgi_scored_at` - ⚡ AUTO-SYNCED from petri_observations

---

## Velocity Calculation Details

### Formula
```
velocity = (current_mgi - previous_mgi) / days_elapsed
```

### Example Scenarios

**Scenario 1: Rapid Growth**
```
Day 1: MGI = 0.20 (20%)
Day 2: MGI = 0.40 (40%)
Velocity = (0.40 - 0.20) / 1.0 = +0.20/day (20% per day!)
Result: Very large, fast pulse in UI
```

**Scenario 2: Moderate Growth**
```
Day 1: MGI = 0.30 (30%)
Day 3: MGI = 0.42 (42%)
Velocity = (0.42 - 0.30) / 2.0 = +0.06/day (6% per day)
Result: Medium pulse in UI
```

**Scenario 3: Slow Growth**
```
Day 1: MGI = 0.15 (15%)
Day 7: MGI = 0.22 (22%)
Velocity = (0.22 - 0.15) / 6.0 = +0.01/day (1% per day)
Result: Small, slow pulse in UI
```

**Scenario 4: Declining (Treatment Working)**
```
Day 1: MGI = 0.60 (60%)
Day 2: MGI = 0.45 (45%)
Velocity = (0.45 - 0.60) / 1.0 = -0.15/day (declining 15% per day)
Result: Negative velocity = good news!
```

---

## Velocity Clamping

Velocity is clamped to prevent outliers:
```sql
growth_velocity := GREATEST(-1.0, LEAST(1.0, v_velocity))
```

**Range:** -1.0 to +1.0 per day
- -1.0 = Full decline (100% → 0%) in 1 day
- +1.0 = Full growth (0% → 100%) in 1 day

---

## Error Handling

Both triggers have comprehensive error handling:

```sql
EXCEPTION WHEN OTHERS THEN
  INSERT INTO async_error_logs (...)
  RETURN NEW;  -- Don't fail the transaction
```

**Check for errors:**
```sql
SELECT * FROM async_error_logs
WHERE trigger_name IN (
  'trg_auto_calculate_mgi_velocity',
  'trg_sync_mgi_to_device_images'
)
ORDER BY created_at DESC;
```

---

## How to Apply Migration

### Option 1: Supabase Dashboard (Recommended)
```
1. Go to Supabase Dashboard
2. Navigate to SQL Editor
3. Open file: supabase/migrations/20251120000000_auto_calculate_mgi_velocity.sql
4. Click "Run"
5. Verify success messages in output
```

### Option 2: CLI
```bash
supabase db push
```

---

## Testing the Flow

### 1. Check Existing Data
```sql
SELECT 
  observation_id,
  mgi_score,
  growth_velocity,
  mgi_scored_at
FROM petri_observations
WHERE mgi_score IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

### 2. Trigger Recalculation (Backfill)
```sql
-- Force velocity recalculation for existing observations
UPDATE petri_observations
SET mgi_score = mgi_score
WHERE mgi_score IS NOT NULL
  AND growth_velocity IS NULL;
```

### 3. Check device_images Sync
```sql
SELECT 
  di.image_id,
  di.mgi_score as image_mgi,
  di.mgi_scored_at,
  po.mgi_score as observation_mgi,
  po.growth_velocity
FROM device_images di
JOIN petri_observations po ON po.observation_id = di.observation_id
WHERE di.observation_type = 'petri'
  AND di.mgi_score IS NOT NULL
ORDER BY di.captured_at DESC
LIMIT 10;
```

### 4. Verify Velocity Logic
```sql
-- Check velocity calculations for a specific device
SELECT 
  device_id,
  order_index,
  created_at,
  mgi_score,
  growth_velocity,
  LAG(mgi_score) OVER (PARTITION BY device_id, order_index ORDER BY created_at) as prev_mgi,
  LAG(created_at) OVER (PARTITION BY device_id, order_index ORDER BY created_at) as prev_time
FROM petri_observations
WHERE device_id = 'YOUR-DEVICE-ID'
  AND mgi_score IS NOT NULL
ORDER BY created_at DESC;
```

---

## Visual Impact

### Homepage Site Map

After migration, the SiteMapViewer will show:

✅ **Colored nodes** based on MGI score  
✅ **Pulse animations** always on  
✅ **Pulse size** scales with velocity (small → very large)  
✅ **Pulse speed** scales with velocity (3s → 1s)  
✅ **Voronoi zones** colored by MGI  

**Velocity Levels:**
- 0-3%/day: Small slow pulse
- 4-7%/day: Medium pulse
- 8-12%/day: Large fast pulse
- 12%+/day: Very large ultra-fast pulse

---

## Benefits

✅ **Automatic** - No manual calculations needed  
✅ **Real-time** - Velocity calculated as soon as MGI is scored  
✅ **Efficient** - device_images synced for fast snapshot queries  
✅ **Cascading** - One MGI score triggers all downstream updates  
✅ **Resilient** - Error handling doesn't break the pipeline  
✅ **Auditable** - All calculations logged via RAISE NOTICE  

---

## Files Created/Modified

✅ **`supabase/migrations/20251120000000_auto_calculate_mgi_velocity.sql`**  
   - New migration file with both triggers

✅ **`MGI_AUTO_VELOCITY_CASCADE_COMPLETE.md`**  
   - This documentation

✅ **`MGI_PULSE_ANIMATION_FINAL.md`**  
   - UI visualization guide

---

## Next Steps

1. **Apply migration** to database
2. **Test with new image** from device
3. **Verify velocity** calculations in petri_observations
4. **Check UI** shows pulse animations correctly
5. **Monitor** async_error_logs for any issues

---

## Monitoring

### Check if triggers are active:
```sql
SELECT 
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name IN (
  'trigger_auto_calculate_mgi_velocity',
  'trigger_sync_mgi_to_device_images'
);
```

### Watch live updates:
```sql
-- Terminal 1: Watch petri_observations
SELECT observation_id, mgi_score, growth_velocity, mgi_scored_at
FROM petri_observations
WHERE mgi_scored_at > NOW() - INTERVAL '1 hour'
ORDER BY mgi_scored_at DESC;

-- Terminal 2: Watch device_images  
SELECT image_id, mgi_score, mgi_scored_at
FROM device_images
WHERE mgi_scored_at > NOW() - INTERVAL '1 hour'
ORDER BY mgi_scored_at DESC;
```

---

## Success Criteria

✅ New image from device triggers Roboflow scoring  
✅ MGI score (0.0-1.0) saved to petri_observations  
✅ growth_velocity auto-calculated (vs previous day)  
✅ MGI score synced to device_images  
✅ Snapshots return MGI + velocity data  
✅ UI shows colored nodes with velocity-based pulses  

---

**The MGI cascade system is now fully automatic! 🎯**
