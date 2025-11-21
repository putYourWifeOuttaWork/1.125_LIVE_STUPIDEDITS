# SNAPSHOT GENERATION NOT WORKING

## Current Status

✅ **Cron Job Running**: `generate-site-snapshots` runs every hour at `:00`
✅ **Job Succeeds**: Last 5 runs all show "succeeded"
❌ **No Snapshots Created**: Function returns "skipped: 4, generated: 0"

## Evidence

### Last Snapshot
- **Wake #2** at 11/21/2025 2:00 PM
- **Current Time**: 6:51 PM (4.9 hours ago)
- **Expected**: Wakes #3, #4, #5, #6, #7 should exist by now

### Cron Job Status
```
Job: generate-site-snapshots
Schedule: 0 * * * * (every hour)
Status: Active ✅

Recent Runs:
- 6:00 PM: succeeded (skipped: 4)
- 5:00 PM: succeeded (skipped: 4)
- 4:00 PM: succeeded (skipped: 4)
- 3:00 PM: succeeded (skipped: 4)
- 2:00 PM: succeeded (generated: 1) ← Last successful generation
```

### Manual Test
```bash
$ node -e "supabase.rpc('generate_scheduled_snapshots')"
Result: {
  "errors": 0,
  "generated": 0,
  "skipped": 4,          ← Why skipping?
  "timestamp": "2025-11-21T18:52:00"
}
```

## Root Cause

The function `generate_scheduled_snapshots()` is **skipping** all sessions.

**Likely reasons:**
1. **Session status check** - Only processes sessions with specific status?
2. **Time window check** - Only generates snapshots during certain hours?
3. **Already generated check** - Prevents duplicate snapshots but may be too aggressive?
4. **Device activity check** - Requires devices to be active?

## Additional Issue: Connectivity Migration Bug

The connectivity tracking migration has a bug:
```sql
-- WRONG:
DATE_PART('day', p_wake_round_end - pp.start_date)::integer

-- Error: function date_part(unknown, integer) does not exist
```

The issue: `timestamp - timestamp` returns an `interval`, but `DATE_PART` expects a timestamp.

**Fix:**
```sql
-- CORRECT:
EXTRACT(DAY FROM (p_wake_round_end - pp.start_date))::integer
```

## Action Items

### Priority 1: Fix Snapshot Generation
1. Find `generate_scheduled_snapshots()` function source
2. Identify why it's skipping sessions
3. Fix the logic to generate hourly snapshots
4. Test manually

### Priority 2: Fix Connectivity Migration
1. Update `add-connectivity-tracking.sql`
2. Change `DATE_PART` to `EXTRACT` for interval calculations
3. Reapply migration
4. Regenerate snapshots with connectivity data

### Priority 3: Test End-to-End
1. Wait for next hour (:00)
2. Verify new snapshot is created
3. Check connectivity data is present
4. Confirm frontend displays correctly

## Files to Investigate

**Database:**
- `generate_scheduled_snapshots()` - Main function (WHERE IS IT?)
- `generate_session_wake_snapshot()` - Called by scheduler
- Cron job definition in `cron.job` table

**Likely locations:**
- `/tmp/cc-agent/51386994/project/supabase/migrations/` - Check all files
- Edge function? - Check `/tmp/cc-agent/51386994/project/supabase/functions/`
- Might be an old migration that needs updating

## Quick Test Commands

**Check function exists:**
```sql
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'generate_scheduled_snapshots';
```

**Check what it does:**
```sql
SELECT generate_scheduled_snapshots();
```

**Force generate a snapshot:**
```sql
SELECT generate_session_wake_snapshot(
  '720e945e-b304-428b-b075-1fdad8d494cc'::uuid,  -- session_id
  3,                                               -- wake_number
  '2025-11-21 15:00:00+00'::timestamptz,          -- wake_start
  '2025-11-21 16:00:00+00'::timestamptz           -- wake_end
);
```

## Summary

Snapshot generation cron job is running and "succeeding", but not actually creating snapshots. It's skipping all sessions for an unknown reason. Need to:

1. Find the function source
2. Debug why it's skipping
3. Fix the connectivity migration DATE_PART bug
4. Get hourly snapshots working again

The connectivity indicator system is ready on the frontend, but won't show data until snapshots are being generated with connectivity metadata!
