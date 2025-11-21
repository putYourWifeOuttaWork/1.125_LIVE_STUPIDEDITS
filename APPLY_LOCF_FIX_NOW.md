# APPLY LOCF FIX - DATABASE SNAPSHOT GENERATION

## Problem Summary

Snapshots are NOT carrying forward device data. Looking at your screenshots:
- **Wake #8**: All 5 devices have temperature data (37.4°F, 52.6°F, 87.6°F, etc.)
- **Wake #9**: Only 3 devices appear, all with NO data (grey circles)

This is because the `generate_session_wake_snapshot()` function only queries data **WITHIN** the wake period, not **UP TO** the wake period.

## The Fix

Changed the telemetry and MGI queries from:
```sql
-- WRONG (only data during this wake period)
WHERE dt.captured_at BETWEEN p_wake_round_start AND p_wake_round_end

-- CORRECT (latest data up to this time - LOCF)
WHERE dt.captured_at <= p_wake_round_end
ORDER BY dt.captured_at DESC
LIMIT 1
```

## How to Apply

### Step 1: Apply the Migration

**Option A: Via Supabase Dashboard (RECOMMENDED)**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor**
4. Click **New Query**
5. Copy the entire contents of `/tmp/fix_snapshot_locf.sql`
6. Paste into the editor
7. Click **Run**

**Option B: Via psql**
```bash
psql $DATABASE_URL < /tmp/fix_snapshot_locf.sql
```

### Step 2: Regenerate Existing Snapshots

After applying the migration, run:
```bash
node regenerate-snapshots-with-locf.mjs
```

This will regenerate all snapshots for "Iot Test Site 2" with the new LOCF logic.

### Step 3: Verify

1. Refresh your browser
2. Navigate to Wake #8 - should show all 5 devices with data
3. Navigate to Wake #9 - should STILL show all 5 devices **with the SAME data!**

## What Changed

### Before (WRONG)
```sql
'telemetry', (
  SELECT ...
  WHERE dt.device_id = d.device_id
    AND dt.captured_at BETWEEN p_wake_round_start AND p_wake_round_end  ❌
  ORDER BY dt.captured_at DESC LIMIT 1
)
```

If device didn't wake during this 1-hour period → `telemetry = null`

### After (CORRECT with LOCF)
```sql
'telemetry', (
  SELECT ...
  WHERE dt.device_id = d.device_id
    AND dt.site_id = v_site_id
    AND dt.captured_at <= p_wake_round_end  ✅
  ORDER BY dt.captured_at DESC LIMIT 1
)
```

Gets the MOST RECENT telemetry **at or before** this wake period → carries forward!

## Expected Results

**Wake #1**: 5 devices with initial data
**Wake #2**: 5 devices (3 new readings + 2 carried forward from Wake #1)
**Wake #3**: 5 devices (1 new reading + 4 carried forward)
...and so on!

**All devices persist with their last known state until they wake again with new data.**

## Files

- `/tmp/fix_snapshot_locf.sql` - Migration to apply
- `regenerate-snapshots-with-locf.mjs` - Script to regenerate snapshots
- This document - Instructions

## Notes

- This is a **DATABASE-LEVEL fix** (not frontend)
- The frontend LOCF code is now **unnecessary** (snapshots have correct data from DB)
- Position, telemetry, MGI, battery - ALL carried forward at the database level
- Snapshots are self-contained and correct for visualization

---

**Next Steps:**
1. Apply the migration (SQL Editor)
2. Run the regeneration script
3. Test in browser
4. Confirm devices persist across wakes! 🎉
