# ✅ FULLY FIXED MIGRATION - READY TO APPLY

## All Issues Fixed

### **Issue #1: device_session_status enum** ✅ FIXED
**Error:** Invalid enum value 'completed' - should be 'success'
**Fixed:** All references now use correct types:
- ✅ 'success' (not 'completed')
- ✅ 'failed'
- ✅ 'partial' (not 'timeout')
- ✅ 'in_progress'

### **Issue #2: device_event_category enum** ✅ FIXED
**Error:** Missing enum values 'Alert' and 'Command'
**Fixed:** Added missing enum values:
- ✅ 'Alert' (added to enum)
- ✅ 'Command' (added to enum)

## How to Apply

### Method 1: Supabase Dashboard (RECOMMENDED)

1. Open **Supabase Dashboard**
2. Go to **SQL Editor**
3. Click **"New query"**
4. Copy/paste this file:
   ```
   supabase/migrations/20251116000010_consolidate_device_events.sql
   ```
5. Click **"Run"**
6. ✅ Should succeed!

### Method 2: Using psql

```bash
# If you have direct database access
psql $DATABASE_URL < supabase/migrations/20251116000010_consolidate_device_events.sql
```

## What This Migration Does

1. **Adds columns to device_history:**
   - `source_table` - Which table generated the event
   - `source_id` - Original record ID
   - `triggered_by` - 'user', 'device', or 'system'

2. **Creates triggers to auto-log:**
   - Schedule changes → ConfigurationChange events
   - Wake sessions → WakeSession events
   - Alerts → Alert events
   - Commands → Command events
   - Telemetry → EnvironmentalReading events (summarized)

3. **Backfills existing events:**
   - Migrates all schedule changes
   - Migrates all completed wake sessions
   - Migrates all alerts
   - Migrates all commands
   - Links to original records via source_id

4. **Creates unified view:**
   - `device_events_unified` view for easy querying

## Expected Results

### Before Migration:
```sql
SELECT COUNT(*) FROM device_history;
-- Result: ~98 events
```

### After Migration:
```sql
SELECT COUNT(*) FROM device_history;
-- Result: 98+ events (depends on backfill)

SELECT
  source_table,
  event_type,
  COUNT(*)
FROM device_history
WHERE source_table IS NOT NULL
GROUP BY source_table, event_type;
-- Should show events from multiple sources
```

## Verification

After applying, run:

```bash
node check-history-state.mjs
```

**Expected output:**
```
Total events: 98+

Sample event columns: ... source_table, source_id, triggered_by ...

New columns present:
  source_table: true
  source_id: true
  triggered_by: true

✅ Migration appears to be applied!
```

## Test the Fix

1. Navigate to device detail page
2. Edit wake schedule
3. Go to History tab
4. **You should see:**
   ```
   ConfigurationChange | wake_schedule_updated
   Wake schedule changed to: [new schedule]
   ```

## If Migration Fails

1. Check error message
2. Most common issues:
   - Enum value mismatches (FIXED in this version!)
   - Trigger already exists (safe to ignore)
   - Column already exists (safe to ignore)

3. If still issues, apply in sections:
   - Section 1: Schema enhancements (ALTER TABLE)
   - Section 2A: Schedule change trigger
   - Section 2B: Wake session trigger
   - Section 2C: Alert trigger
   - Section 2D: Command trigger
   - Section 2E: Telemetry trigger
   - Section 3: Backfill
   - Section 4: View creation

## Rollback (if needed)

```sql
-- Remove triggers
DROP TRIGGER IF EXISTS trigger_log_schedule_change ON device_schedule_changes;
DROP TRIGGER IF EXISTS trigger_log_wake_session ON device_wake_sessions;
DROP TRIGGER IF EXISTS trigger_log_device_alert ON device_alerts;
DROP TRIGGER IF EXISTS trigger_log_device_command ON device_commands;
DROP TRIGGER IF EXISTS trigger_log_telemetry_summary ON device_telemetry;

-- Remove columns (optional)
ALTER TABLE device_history DROP COLUMN IF EXISTS source_table;
ALTER TABLE device_history DROP COLUMN IF EXISTS source_id;
ALTER TABLE device_history DROP COLUMN IF EXISTS triggered_by;

-- Remove view
DROP VIEW IF EXISTS device_events_unified;
```

## Summary

**✅ Enum values fixed**
**✅ Ready to apply**
**✅ Safe migration**
**✅ Includes rollback plan**

**Apply now using Supabase Dashboard SQL Editor!**
