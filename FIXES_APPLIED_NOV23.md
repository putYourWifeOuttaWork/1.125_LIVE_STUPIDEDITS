# ✅ Complete Fix Summary - Nov 23, 2025

## Root Cause Analysis

Session counters showing **all zeros** despite device activity. After investigation, found a **chain of missing linkages**:

### The Problem Chain
```
1. Device sends image + metadata
2. fn_wake_ingestion_handler creates:
   - device_images record (image_id)
   - device_wake_payloads record (payload_id)
   - Links them: wake_payload.image_id = image_id ✅

3. Edge function stores in buffer:
   - buffer.imageRecord = { image_id }
   - buffer.imageRecord.wake_payload_id = MISSING ❌

4. Image completes → finalize.ts runs:
   - Checks buffer.imageRecord.wake_payload_id
   - Finds NULL → skips wake_payload update ❌
   - wake_payload stays 'pending' forever ❌

5. fn_image_completion_handler runs:
   - Looks up wake_payload by image_id
   - Updates payload_status = 'complete' ✅
   - BUT edge function already checked and skipped ❌

6. Session roll-up triggers:
   - Wait for payload_status = 'complete'
   - Never fires because status stays 'pending' ❌
   - Counters remain at 0 ❌
```

## Fixes Applied

### Fix 1: Session Roll-Up Triggers ✅
**File:** `session-rollup-triggers-FIXED.sql`
**Status:** Applied to database

Created two trigger functions:
1. `increment_session_wake_counts()` - Increments counters on payload status change
2. `update_session_status_on_wake()` - Auto-transitions pending → in_progress

**Correct column mappings:**
- `completed_wake_count` ← `payload_status = 'complete'`
- `failed_wake_count` ← `payload_status = 'failed'`
- `extra_wake_count` ← `overage_flag = true`

### Fix 2: Buffer Image Record Linkage ✅
**File:** `supabase/functions/mqtt_device_handler/ingest.ts`
**Line:** 442-445
**Status:** Applied to code, needs edge function deployment

**Before:**
```typescript
buffer.imageRecord = { image_id: result.image_id };
```

**After:**
```typescript
buffer.imageRecord = {
  image_id: result.image_id,
  wake_payload_id: result.payload_id  // Link to wake payload for finalization
};
```

This ensures finalize.ts can find and update the wake_payload when image completes.

## What Was Wrong

The buffer's `imageRecord` object was missing the `wake_payload_id` field. When `finalize.ts` ran:

```typescript
// Line 80 in finalize.ts
if (buffer.imageRecord.wake_payload_id) {  // ← This was ALWAYS false!
  // Update wake_payload to 'complete'
}
```

Because `wake_payload_id` was missing from the buffer, the if-statement always failed, and the wake_payload never got marked as 'complete'. The session roll-up triggers were waiting for that status change!

## Action Required

### Priority 1: Deploy Edge Function ⏳
The MQTT handler edge function needs redeployment:

1. Go to Supabase Dashboard → Edge Functions
2. Find `mqtt_device_handler`
3. Click Deploy
4. Wait for completion

### Priority 2: Test With New Device Wake ⏳
After deployment:

1. Send a test device wake with image
2. Verify wake_payload gets `payload_status = 'complete'`
3. Verify session counters increment
4. Check UI shows correct counts

### Priority 3: Backfill Historical Data (Optional)
For existing sessions with orphaned data:

```sql
-- Run after edge function deployed and tested
-- This manually marks old payloads as complete if their image completed
UPDATE device_wake_payloads wp
SET
  payload_status = 'complete',
  image_status = 'complete',
  is_complete = true
FROM device_images di
WHERE wp.image_id = di.image_id
  AND di.status = 'complete'
  AND wp.payload_status = 'pending'
  AND wp.captured_at >= '2025-11-01';

-- Then backfill session counts
UPDATE site_device_sessions s
SET
  completed_wake_count = (
    SELECT COUNT(*)
    FROM device_wake_payloads w
    WHERE w.site_device_session_id = s.session_id
      AND w.payload_status = 'complete'
  )
WHERE session_date >= '2025-11-01';
```

## Files Changed

1. ✅ `session-rollup-triggers-FIXED.sql` - Database triggers (APPLIED)
2. ✅ `supabase/functions/mqtt_device_handler/ingest.ts` - Buffer linkage (NEEDS DEPLOYMENT)

## Expected Results

After edge function deployment:

**Session Detail Page:**
- ✅ Total Wakes: Shows actual count (not 0)
- ✅ Wakes This Session: Completed/Failed/Extra breakdown
- ✅ Device Performance: Per-device wake counts
- ✅ Status: Auto-updates to 'in_progress'
- ✅ Images This Session: Correct count

**Device Pages:**
- ✅ Total wakes increment automatically
- ✅ Total images increment automatically
- ✅ Real-time session tracking

## Testing Checklist

- [ ] Deploy mqtt_device_handler edge function
- [ ] Send test device wake message
- [ ] Verify wake_payload.payload_status becomes 'complete'
- [ ] Verify wake_payload.image_id is set
- [ ] Verify session.completed_wake_count increments
- [ ] Verify UI shows correct counts
- [ ] Check session status transitions to 'in_progress'
- [ ] Test device performance summary table

## Summary

**Issue:** Session counters stuck at zero
**Root Cause:** Missing wake_payload_id in buffer object
**Domino Effect:** Finalize couldn't update payload → Status stayed 'pending' → Triggers never fired
**Fix:** Added wake_payload_id to buffer.imageRecord
**Status:** Code fixed, needs edge function deployment
**Build:** ✅ Successful

All fixes complete - just needs deployment to go live!
