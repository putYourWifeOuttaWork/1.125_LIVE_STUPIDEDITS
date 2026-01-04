# Snapshot Function Fixes Complete

## Issues Fixed

### 1. DATE_PART Type Error (Line 104-105)
**Problem:** `DATE_PART('day', timestamp - date)` caused type mismatch
**Solution:** Changed to simple date subtraction `(date1::date - date2::date)`

```sql
-- BEFORE (error)
'program_day', DATE_PART('day', p_wake_round_end - pp.start_date)::integer

-- AFTER (working)
'program_day', (p_wake_round_end::date - pp.start_date::date)
```

### 2. Missing Column: is_acknowledged (Line 222)
**Problem:** `device_alerts.is_acknowledged` column doesn't exist
**Solution:** Changed to use `resolved_at IS NULL` to find unresolved alerts

```sql
-- BEFORE (error)
AND da.is_acknowledged = false

-- AFTER (working)
AND da.resolved_at IS NULL
```

### 3. Missing Columns: threshold_value, actual_value (Lines 214-215)
**Problem:** These columns don't exist in `device_alerts` table
**Solution:** Extract from `metadata` JSONB column

```sql
-- BEFORE (error)
'threshold_value', threshold_value,
'actual_value', actual_value,

-- AFTER (working)
'threshold_value', metadata->>'threshold_value',
'actual_value', metadata->>'actual_value',
'message', message,
'metadata', metadata
```

## Next Steps

### 1. Reapply the Fixed SQL Function (1 minute)
```bash
# Copy the UPDATED fix-comprehensive-snapshot-function.sql
# Paste into Supabase SQL Editor
# Click "Run"
```

### 2. Regenerate Snapshots (30 seconds)
```bash
node regenerate-jan4-snapshots.mjs
```

**Expected Output:**
```
Found 23 wake payloads
Grouped into 13 hourly buckets
Wake #1: 00:00
  Payloads: 2
  ✅ Created snapshot
...
✅ Created 13/13 snapshots
```

### 3. Verify Visualization
- Refresh session detail page
- Map should show device positions
- Timeline should display all 13 wake periods
- Device states should include telemetry data

## Files Modified
- `fix-comprehensive-snapshot-function.sql` - All three bugs fixed
- Build verified: ✅ No TypeScript errors
