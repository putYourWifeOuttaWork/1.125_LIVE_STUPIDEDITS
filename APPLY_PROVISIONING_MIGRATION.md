# Device Provisioning Automation - Migration Guide

## Overview

This migration adds **automated device initialization** after mapping devices to sites/programs. It solves the critical provisioning gap where devices were mapped via junction tables but the `devices` table columns (site_id, program_id, company_id) were not automatically populated.

## What This Migration Does

### New Functions

1. **`fn_calculate_next_wake(cron_expression, from_timestamp)`**
   - Calculates next wake time from cron expression
   - Supports common patterns: `0 8,16 * * *`, `0 */6 * * *`, `0 8 * * *`
   - Used for device scheduling and ACK_OK messages

2. **`fn_initialize_device_after_mapping(device_id, site_id, program_id)`**
   - **Automatically populates all device fields after mapping**
   - Sets: site_id, program_id, company_id, next_wake_at, mapped_at
   - Transitions provisioning_status: `pending_mapping` → `active`
   - Creates device_history event for audit trail
   - Validates complete lineage chain

3. **`fn_trigger_device_lineage_update()` [TRIGGER]**
   - Automatically calls fn_initialize_device_after_mapping
   - Fires when device_site_assignments is created/updated with is_active=TRUE
   - Ensures atomic update of all related fields

4. **`fn_validate_device_provisioning(device_id)`**
   - Validates device provisioning state
   - Checks junction table consistency
   - Identifies status transition issues
   - Returns validation report with list of issues

5. **`fn_find_devices_with_incomplete_lineage()`**
   - Finds devices needing lineage fix
   - Identifies mismatches between devices table and junction tables
   - Used for maintenance and backfill operations

## How to Apply This Migration

### Option 1: Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Navigate to your project: https://supabase.com/dashboard/project/_
   - Click on "SQL Editor" in the left sidebar

2. **Create New Query**
   - Click "New query" button
   - Name it: "Device Provisioning Automation"

3. **Copy Migration SQL**
   - Open file: `supabase/migrations/20251115000000_device_provisioning_automation.sql`
   - Copy entire contents (529 lines)

4. **Paste and Run**
   - Paste into SQL Editor
   - Click "Run" button (or Cmd/Ctrl + Enter)
   - Wait for confirmation message

5. **Verify Success**
   - You should see: "Success. No rows returned"
   - Check "Functions" tab - should see 5 new functions
   - Check "Triggers" tab - should see `trigger_device_site_assignment_lineage_update`

### Option 2: Supabase CLI (If Installed)

```bash
# In project root
supabase db push

# Or apply specific migration
supabase migration up
```

### Option 3: psql Direct Connection

```bash
# Connect to your database
psql "postgresql://postgres:[YOUR-PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres"

# Run migration
\i supabase/migrations/20251115000000_device_provisioning_automation.sql
```

## Verification Steps

After applying the migration, verify it worked:

###  1. Check Functions Created

```sql
SELECT proname
FROM pg_proc
WHERE proname LIKE 'fn_%device%' OR proname LIKE 'fn_calculate%'
ORDER BY proname;
```

Expected results:
- fn_calculate_next_wake
- fn_find_devices_with_incomplete_lineage
- fn_initialize_device_after_mapping
- fn_trigger_device_lineage_update
- fn_validate_device_provisioning

### 2. Check Trigger Created

```sql
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname = 'trigger_device_site_assignment_lineage_update';
```

Expected: 1 row showing trigger on `device_site_assignments` table

### 3. Test fn_calculate_next_wake

```sql
SELECT fn_calculate_next_wake('0 8,16 * * *', now());
```

Expected: Returns a timestamp for the next 8am or 4pm

### 4. Find Devices Needing Fix

```sql
SELECT * FROM fn_find_devices_with_incomplete_lineage();
```

Expected: Returns list of devices with incomplete lineage (may be empty if none exist)

## What Happens Next

### Automatic Behavior

Once this migration is applied:

1. **When a super admin maps a device to a site** (via DeviceMappingModal):
   - INSERT into `device_site_assignments` with is_active=TRUE
   - **TRIGGER automatically fires**
   - Calls `fn_initialize_device_after_mapping`
   - Populates: site_id, program_id, company_id, timezone
   - Calculates: next_wake_at from wake_schedule_cron
   - Sets: provisioning_status='active', is_active=true, mapped_at=now()
   - Creates device_history event

2. **Device now shows as fully provisioned**:
   - Status badge changes from "Pending" to "Active"
   - Device appears in site's device list
   - fn_resolve_device_lineage returns complete data
   - MQTT handler can route messages properly

3. **Validation is automatic**:
   - Ensures site belongs to program
   - Verifies program belongs to company
   - Prevents orphaned assignments
   - Logs all changes to device_history

### Manual Steps Required

After migration, you need to:

1. **Run backfill script** for existing devices (see next section)
2. **Test provisioning flow** with a new device
3. **Update UI** to show new capabilities (optional)

## Backfill Existing Devices

If you have devices that were manually mapped before this migration, run:

```bash
node backfill-device-lineage.mjs
```

This script will:
- Find all devices with incomplete lineage
- Apply fn_initialize_device_after_mapping to each
- Fix any inconsistencies
- Generate report of changes

## Troubleshooting

### Migration Fails with "already exists"

This is fine - it means functions were created previously. The migration is idempotent (safe to run multiple times).

### Trigger not firing

Check if trigger is enabled:

```sql
SELECT tgenabled
FROM pg_trigger
WHERE tgname = 'trigger_device_site_assignment_lineage_update';
```

Should return 'O' (enabled). If 'D' (disabled), enable it:

```sql
ALTER TABLE device_site_assignments
ENABLE TRIGGER trigger_device_site_assignment_lineage_update;
```

### Device still shows "pending_mapping" after assignment

Run validation:

```sql
SELECT * FROM fn_validate_device_provisioning('[device-id-here]');
```

This will show what's missing. Then manually initialize:

```sql
SELECT * FROM fn_initialize_device_after_mapping(
  '[device-id]'::uuid,
  '[site-id]'::uuid,
  '[program-id]'::uuid
);
```

### Lineage resolution returns error

Check the error field:

```sql
SELECT fn_resolve_device_lineage('[device-mac]');
```

Common errors:
- `device_not_assigned_to_site` - device needs mapping
- `site_not_assigned_to_program` - site misconfigured
- `program_not_assigned_to_company` - program misconfigured

## Impact on Existing Code

### Breaking Changes

None. This is purely additive functionality.

### Enhanced Behavior

- `useDevice().mapDevice()` hook now automatically triggers initialization
- Device queries now return complete lineage data
- MQTT handler can resolve device context without manual lookups

### Required Changes

None immediately, but recommended:

1. Update DevicesPage to show initialization status
2. Add UI indicators for auto-calculated fields (next_wake_at)
3. Show device_history events in DeviceDetailPage

## Next Steps

1. ✅ Apply this migration
2. ⏭️ Run backfill script: `node backfill-device-lineage.mjs`
3. ⏭️ Test with new device provisioning
4. ⏭️ Update mqtt-service to send welcome commands
5. ⏭️ Enhance UI to show auto-populated fields

## Related Files

- Migration: `supabase/migrations/20251115000000_device_provisioning_automation.sql`
- Application script: `apply-provisioning-migration.mjs`
- Backfill script: `backfill-device-lineage.mjs` (to be created)
- Test script: `test-device-provisioning-flow.mjs` (to be created)

## Support

If you encounter issues:

1. Check Supabase logs in Dashboard → Logs
2. Run validation: `SELECT * FROM fn_find_devices_with_incomplete_lineage();`
3. Check device_history for error events
4. Review this guide's Troubleshooting section

---

**Migration Version**: 20251115000000
**Created**: 2025-11-15
**Status**: Ready to apply
