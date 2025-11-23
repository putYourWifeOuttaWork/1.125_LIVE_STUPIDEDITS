# ✅ Session Counters Fix - CORRECTED VERSION

## What Was Wrong
Used wrong column names! The schema has:
- ❌ `wake_complete` → ✅ `payload_status`
- ❌ `wake_failed` → ✅ `payload_status`  
- ❌ `is_extra_wake` → ✅ `overage_flag`

## Apply Now (2 Steps)

### Step 1: Apply Triggers
Copy and run: **`session-rollup-triggers-FIXED.sql`**

In Supabase SQL Editor:
1. Paste the entire file
2. Click Run
3. Wait for success message

### Step 2: Backfill Historical Data
Copy and run: **`backfill-session-counts.sql`**

This will:
- Recalculate counts for all sessions since Nov 1
- Update status from 'pending' to 'in_progress' where needed
- Show you a summary of results

## What the Triggers Do

**Trigger 1: `increment_session_wake_counts()`**
- Fires on INSERT/UPDATE to `device_wake_payloads`
- Increments `completed_wake_count` when `payload_status = 'complete'`
- Increments `failed_wake_count` when `payload_status = 'failed'`
- Increments `extra_wake_count` when `overage_flag = true`

**Trigger 2: `update_session_status_on_wake()`**
- Fires on INSERT to `device_wake_payloads`
- Changes `status` from 'pending' to 'in_progress' on first wake

## Expected Results

After applying:
✅ Session "Total Wakes" shows correct count (not 0)
✅ "Wakes This Session" panel shows completed/failed/extra counts
✅ Device Performance table shows per-device wake counts
✅ Session status automatically updates to 'in_progress'
✅ Future wakes automatically increment counters

## Files

1. **`session-rollup-triggers-FIXED.sql`** - Corrected trigger migration
2. **`backfill-session-counts.sql`** - Backfill historical data

Both files are ready to run in order!
