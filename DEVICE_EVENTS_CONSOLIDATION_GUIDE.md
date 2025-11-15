# Device Events Consolidation - Implementation Guide

## Overview

We've consolidated all device event tracking into a single `device_history` table using JSONB for flexible event data storage. This solves the issue where schedule changes and other events weren't showing in the device history UI.

---

## Problem Statement

**Before:**
- Events scattered across multiple tables:
  - `device_history` - Manual lifecycle events
  - `device_wake_sessions` - Wake/sleep cycles
  - `device_alerts` - Alert events
  - `device_commands` - Commands issued
  - `device_schedule_changes` - Schedule updates (NOT in history!)
  - `device_telemetry` - Environmental readings
- UI couldn't show complete timeline
- Schedule changes were invisible in device history

**After:**
- Single source of truth: `device_history`
- Automatic logging via triggers
- JSONB for flexible event data
- Complete device timeline visible in UI

---

## Migration Created

**File:** `supabase/migrations/20251116000010_consolidate_device_events.sql`

### What It Does:

1. **Schema Enhancements**
   - Adds `source_table` column - Tracks which table generated the event
   - Adds `source_id` column - Original record ID
   - Adds `triggered_by` column - 'user', 'device', or 'system'
   - Creates indexes for better query performance

2. **Trigger Functions**
   - `log_device_schedule_change()` - Tracks wake schedule updates
   - `log_device_wake_session()` - Tracks wake/sleep cycles
   - `log_device_alert()` - Tracks alert creation and resolution
   - `log_device_command()` - Tracks command lifecycle
   - `log_device_telemetry_summary()` - Tracks significant telemetry changes

3. **Backfill**
   - Migrates existing events from all source tables
   - Preserves timestamps and context
   - Links to original records via `source_id`

4. **View Creation**
   - `device_events_unified` view for easy querying

---

## How to Apply Migration

### Option 1: Supabase Dashboard (Recommended)

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Create new query
4. Copy contents of `supabase/migrations/20251116000010_consolidate_device_events.sql`
5. Run the query
6. Verify success (should see "Success" message)

### Option 2: Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db push

# Or apply specific migration
supabase migration up
```

### Option 3: Manual Application

If the above don't work, you can apply in sections:

**Step 1: Add columns**
```sql
ALTER TABLE device_history ADD COLUMN IF NOT EXISTS source_table text;
ALTER TABLE device_history ADD COLUMN IF NOT EXISTS source_id uuid;
ALTER TABLE device_history ADD COLUMN IF NOT EXISTS triggered_by text DEFAULT 'system';
```

**Step 2: Create indexes**
```sql
CREATE INDEX IF NOT EXISTS idx_device_history_source
  ON device_history(source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_device_history_event_timestamp_device
  ON device_history(device_id, event_timestamp DESC);
```

**Step 3: Apply triggers**
(Copy each trigger function and CREATE TRIGGER statement from the migration file)

**Step 4: Backfill**
(Copy the INSERT statements from the migration file)

---

## Verification

After applying the migration, run:

```bash
node check-history-state.mjs
```

**Expected output:**
```
Total events: 98+
New columns present:
  source_table: true
  source_id: true
  triggered_by: true

✅ Migration appears to be applied!
```

---

## Testing the Fix

### Test Schedule Change Tracking:

1. Navigate to a device detail page
2. Click "Edit Device Settings"
3. Change the wake schedule (e.g., from `0 */6 * * *` to `0 */4 * * *`)
4. Save changes
5. Go to "History" tab
6. **Expected:** You should now see an event like:
   ```
   ConfigurationChange | wake_schedule_updated
   Wake schedule changed to: 0 */4 * * * (effective: 2025-11-16)
   ```

### Test Wake Session Tracking:

When a device wakes up, you'll see events like:
```
WakeSession | wake_completed
Wake session completed successfully (12500 ms)
```

### Test Alert Tracking:

When an alert triggers, you'll see:
```
Alert | alert_triggered_low_battery
Battery voltage dropped below threshold: 3.3V
```

---

## Event Data Structure

### Schedule Change Event:
```json
{
  "event_type": "wake_schedule_updated",
  "event_category": "ConfigurationChange",
  "severity": "info",
  "description": "Wake schedule changed to: 0 */4 * * * (effective: 2025-11-16)",
  "event_data": {
    "new_schedule": "0 */4 * * *",
    "effective_date": "2025-11-16"
  },
  "metadata": {
    "requested_at": "2025-11-15T20:00:00Z",
    "applied_at": "2025-11-15T20:00:01Z"
  },
  "triggered_by": "user",
  "source_table": "device_schedule_changes",
  "source_id": "uuid-here"
}
```

### Wake Session Event:
```json
{
  "event_type": "wake_completed",
  "event_category": "WakeSession",
  "severity": "info",
  "description": "Wake session completed successfully (12500 ms)",
  "event_data": {
    "session_duration_ms": 12500,
    "image_captured": true,
    "chunks_sent": 150,
    "chunks_total": 150,
    "next_wake_scheduled": "2025-11-16T07:00:00Z"
  },
  "metadata": {
    "wifi_rssi": -65,
    "battery_voltage": 3.7,
    "retry_count": 0
  },
  "triggered_by": "device",
  "source_table": "device_wake_sessions"
}
```

---

## UI Changes

### What Changed:

**✅ No UI code changes needed!**

The UI already queries `device_history` - it will automatically show all new events once the migration is applied.

### Existing UI Features:

1. **Cascading Filters**
   - Program dropdown → Site dropdown → Session dropdown
   - Pretty date labels for sessions
   - Disabled states for dependent dropdowns

2. **Pagination**
   - 50 events per page
   - Previous/Next buttons
   - Page number buttons
   - Total count display

3. **Existing Filters**
   - Date range
   - Event category (multi-select)
   - Severity level (multi-select)
   - Search text
   - "Errors Only" checkbox

4. **Event Display**
   - Expandable rows for event details
   - Shows `event_data` and `metadata` JSONB fields
   - Color-coded severity indicators
   - Event category badges

---

## Benefits

### 1. Complete Timeline
- All device events in one place
- No missing events
- Easy to understand device behavior

### 2. Flexible Schema
- JSONB allows any event-specific data
- No schema changes needed for new event types
- Future-proof architecture

### 3. Better Performance
- Single table queries (no UNIONs)
- Indexed for fast filtering
- Pagination works efficiently

### 4. Audit Trail
- `source_table` and `source_id` link to original records
- `triggered_by` shows who/what caused the event
- Full context preserved in `metadata`

### 5. Simplified Maintenance
- One query to get all events
- Easier to add new event types
- Less code duplication

---

## Event Categories

```typescript
enum DeviceEventCategory {
  'Lifecycle',           // Provisioning, activation, deactivation
  'Assignment',          // Program/site assignments
  'WakeSession',         // Wake cycles
  'ImageCapture',        // Image-related events
  'Telemetry',          // Environmental readings (summarized)
  'Alert',              // Device alerts
  'Command',            // Commands issued to device
  'ConfigurationChange', // Schedule changes, settings updates
  'Communication',       // MQTT, WiFi events
  'BatteryStatus',      // Battery health events
  'MaintenanceActivity', // Manual interventions
  'ErrorEvent'          // Errors, failures
}
```

---

## Future Enhancements

### Potential Additions:

1. **Real-time Updates**
   - Use Supabase Realtime to stream new events
   - Live timeline updates without refresh

2. **Event Filtering by Source**
   - Add dropdown to filter by source_table
   - Show only wake sessions, only commands, etc.

3. **Event Analytics**
   - Count events by category
   - Show event frequency charts
   - Identify patterns

4. **Event Export**
   - Export filtered events to CSV
   - Include full JSONB data

5. **Event Search**
   - Full-text search in event_data JSONB
   - Search in metadata JSONB

---

## Rollback Plan

If issues occur, you can rollback by:

1. **Remove triggers:**
```sql
DROP TRIGGER IF EXISTS trigger_log_schedule_change ON device_schedule_changes;
DROP TRIGGER IF EXISTS trigger_log_wake_session ON device_wake_sessions;
DROP TRIGGER IF EXISTS trigger_log_device_alert ON device_alerts;
DROP TRIGGER IF EXISTS trigger_log_device_command ON device_commands;
DROP TRIGGER IF EXISTS trigger_log_telemetry_summary ON device_telemetry;
```

2. **Remove columns (optional):**
```sql
ALTER TABLE device_history DROP COLUMN IF EXISTS source_table;
ALTER TABLE device_history DROP COLUMN IF EXISTS source_id;
ALTER TABLE device_history DROP COLUMN IF EXISTS triggered_by;
```

3. **Keep backfilled data** - It won't hurt anything

---

## Files Modified

### New Files:
1. `supabase/migrations/20251116000010_consolidate_device_events.sql`
   - Complete migration with triggers and backfill

2. `check-history-state.mjs`
   - Script to verify migration state

3. `DEVICE_EVENTS_CONSOLIDATION_GUIDE.md` (this file)
   - Complete documentation

### Existing Files (No Changes):
- `src/hooks/useDeviceHistory.ts` - Already queries device_history ✅
- `src/components/devices/DeviceHistoryPanel.tsx` - Ready to display new events ✅
- All other device-related components ✅

---

## Summary

**✅ Migration Ready:** `supabase/migrations/20251116000010_consolidate_device_events.sql`

**✅ UI Ready:** No code changes needed - UI already queries device_history

**✅ Testing Ready:** Scripts provided to verify migration

**✅ Documentation Complete:** This guide

**Next Step:** Apply the migration using Supabase Dashboard or CLI, then test by editing a device wake schedule!

---

## Questions?

**Q: Will this affect existing data?**
A: No - existing events are preserved and backfilled. Nothing is deleted.

**Q: Will the UI break if migration isn't applied?**
A: No - UI will continue working as before, just won't show the new event types.

**Q: Can I apply this in production?**
A: Yes - migration is safe and non-destructive. Test in staging first if possible.

**Q: What if I see errors during migration?**
A: Check the error message - often it's just "trigger already exists" which is fine. The migration has IF EXISTS checks.

**Q: How do I know it worked?**
A: Run `node check-history-state.mjs` - it will tell you if new columns exist and show event counts.
