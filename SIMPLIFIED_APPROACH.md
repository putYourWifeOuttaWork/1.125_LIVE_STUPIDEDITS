# Simplified Migration Approach

## Problem

The consolidation migration has column mismatches across multiple tables due to schema evolution.

## Solution

Apply Step 1 (enum values) which succeeded, then manually fix the device history issue with just schedule changes.

---

## STEP 1: Already Applied ✅

File: `20251116000009_add_event_category_enums.sql`

Result: Added 'Alert' and 'Command' enum values successfully.

---

## STEP 2: Simplified Fix for Schedule Changes Only

Instead of the full consolidation migration, apply this minimal fix:

```sql
-- Add columns to device_history
ALTER TABLE device_history ADD COLUMN IF NOT EXISTS source_table text;
ALTER TABLE device_history ADD COLUMN IF NOT EXISTS source_id uuid;
ALTER TABLE device_history ADD COLUMN IF NOT EXISTS triggered_by text DEFAULT 'system';

-- Create index
CREATE INDEX IF NOT EXISTS idx_device_history_source
  ON device_history(source_table, source_id);

-- Create trigger function for schedule changes
CREATE OR REPLACE FUNCTION log_device_schedule_change()
RETURNS TRIGGER AS $$
DECLARE
  v_program_id uuid;
  v_site_id uuid;
BEGIN
  -- Get program_id and site_id from devices table
  SELECT program_id, site_id INTO v_program_id, v_site_id
  FROM devices
  WHERE device_id = NEW.device_id;

  INSERT INTO device_history (
    device_id,
    company_id,
    program_id,
    site_id,
    event_category,
    event_type,
    severity,
    description,
    event_data,
    triggered_by,
    source_table,
    source_id,
    user_id,
    event_timestamp
  ) VALUES (
    NEW.device_id,
    NEW.company_id,
    v_program_id,
    v_site_id,
    'ConfigurationChange',
    'wake_schedule_updated',
    'info',
    format('Wake schedule changed to: %s (effective: %s)', NEW.new_wake_schedule_cron, NEW.effective_date::date),
    jsonb_build_object(
      'new_schedule', NEW.new_wake_schedule_cron,
      'effective_date', NEW.effective_date
    ),
    'user',
    'device_schedule_changes',
    NEW.change_id,
    NEW.requested_by_user_id,
    NEW.requested_at
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_log_schedule_change ON device_schedule_changes;
CREATE TRIGGER trigger_log_schedule_change
AFTER INSERT ON device_schedule_changes
FOR EACH ROW
EXECUTE FUNCTION log_device_schedule_change();
```

---

## Test

1. Apply the SQL above via Supabase Dashboard
2. Edit a device schedule
3. Check device history tab
4. Should see: `ConfigurationChange | wake_schedule_updated`

---

## Next Steps

Once this works:
1. Add triggers for other tables one by one
2. Verify column names for each table first
3. Test each trigger individually
4. Backfill data after triggers are confirmed working

---

##  Why This Approach?

**Pros:**
- Solves your immediate problem (schedule changes visible)
- Low risk (only touches one trigger)
- Easy to test and verify
- Can add more triggers incrementally

**Cons:**
- Not a complete solution
- Other events still not logged
- Need to add remaining triggers later

But it gets you unblocked immediately!
