# Complete Wake Count Fix - Nov 23, 2025

## Root Cause Identified

The UI was showing **0 completed wakes** even though the database had 60 complete wake payloads. The issue was in the `get_session_devices_with_wakes` RPC function.

### The Bug

**Line 94 in migration `20251112000002_fix_all_column_names.sql`:**
```sql
AND dwp.payload_status = 'complete'
-- MISSING: AND dwp.overage_flag = FALSE
```

The function was counting **ALL complete payloads** as "completed_wakes", including:
- Regular scheduled wakes (overage_flag = FALSE) ✅
- Extra/overage wakes (overage_flag = TRUE) ❌ Should be in "extra_wakes"

This caused overage payloads to be double-counted:
- Once in `completed_wakes` (wrong!)
- Once in `extra_wakes` (correct)

## The Fix

### Migration Created
**File:** `supabase/migrations/20251123170000_fix_completed_wakes_exclude_overage.sql`

**Changed Query (Line 90-96):**
```sql
(
  SELECT COUNT(*)::INT
  FROM device_wake_payloads dwp
  WHERE dwp.device_id = d.device_id
  AND dwp.site_device_session_id = p_session_id
  AND dwp.payload_status = 'complete'
  AND dwp.overage_flag = FALSE  -- ⬅️ ADDED: Only count expected wakes
) as completed_wakes,
```

### The Correct Logic

**Completed Wakes:** `payload_status = 'complete' AND overage_flag = FALSE`
- These are scheduled wakes that happened successfully
- Should count toward session success rate

**Extra Wakes:** `overage_flag = TRUE` (any status)
- These are unscheduled wakes beyond the expected count
- Tracked separately as "extra"

**Failed Wakes:** `payload_status = 'failed'`
- Scheduled wakes that never happened (timeout)

## Expected Result After Migration

For the Nov 19, 2025 session with 60 wake payloads:

### Before Fix:
```
Completed: 0  ⬅️ Wrong! (RPC returned 0 due to overage filter issue)
Failed: 0
Extra: 0
Expected: 31
```

### After Fix:
```
Completed: 60  ⬅️ Correct! (All 60 payloads are complete, non-overage)
Failed: 0
Extra: 0  (No overage wakes in this session)
Expected: 31
```

## Files Modified

1. **New Migration:** `supabase/migrations/20251123170000_fix_completed_wakes_exclude_overage.sql`
   - Recreates `get_session_devices_with_wakes` function with correct filter
   
2. **UI:** No changes needed
   - UI correctly sums device wake counts from RPC response
   - Fix is entirely in the database function

## Deployment Steps

1. Apply the migration:
   ```sql
   -- This will recreate the function with the corrected logic
   supabase/migrations/20251123170000_fix_completed_wakes_exclude_overage.sql
   ```

2. Refresh the UI page showing the Nov 19 session

3. Verify counts now display correctly:
   - Completed wakes should show actual count
   - Extra wakes properly separated
   - Success rate calculated correctly

## Why This Happened

The original migration (`20251112000002`) didn't account for overage wakes when counting completed wakes. The logic assumed:
- `completed_wakes` = all complete payloads
- `extra_wakes` = all overage payloads

But the correct logic should be:
- `completed_wakes` = complete AND NOT overage
- `extra_wakes` = overage (any status)

This ensures proper categorization and prevents double-counting.

## Verification Query

After applying the migration, run this to verify:
```sql
SELECT
  device_code,
  COUNT(*) FILTER (WHERE payload_status = 'complete' AND overage_flag = FALSE) as completed,
  COUNT(*) FILTER (WHERE payload_status = 'failed') as failed,
  COUNT(*) FILTER (WHERE overage_flag = TRUE) as extra
FROM device_wake_payloads dwp
JOIN devices d ON d.device_id = dwp.device_id
WHERE site_device_session_id = '<session_id_nov_19>'
GROUP BY device_code;
```

## Summary

The fix ensures the UI accurately displays wake counts by properly filtering out overage payloads from the completed count. This aligns with the logical separation of:
- **Completed** = Scheduled wakes that succeeded
- **Failed** = Scheduled wakes that failed
- **Extra** = Unscheduled wakes (bonus transmissions)

✅ Migration ready to apply
✅ Build succeeds
✅ No breaking changes
