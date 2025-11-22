# Device Assignment System - Comprehensive Audit

**Date:** November 22, 2025
**Status:** ⚠️ CRITICAL - Data Inconsistency Found
**Issue:** Two different assignment methods exist, causing junction table gaps

---

## Executive Summary

**Problem:** Device assignments can happen through two different code paths:
1. **New Method** (Device Detail Page): Updates BOTH devices table AND junction tables ✅
2. **Old Method** (Site Template / Device Pool): Updates ONLY devices table ❌

**Impact:**
- 6 devices have inconsistent assignments
- LAB devices have NO junction table records
- Assignment card shows wrong data
- Session analytics may be broken

---

## Audit Results

### Code Path 1: Device Detail Page (Mapping/Reassign)

**Location:** `src/hooks/useDevice.ts` lines 211-366 (`mapDeviceMutation`)

**What it does:**
1. ✅ Deactivates old junction records (lines 227-255)
2. ✅ Creates NEW `device_site_assignments` record (lines 258-273)
3. ✅ Creates NEW `device_program_assignments` record (lines 275-289)
4. ✅ Updates `devices.site_id` and `devices.program_id` (lines 336-337)

**Status:** ✅ **CORRECT** - Uses junction tables properly

---

### Code Path 2: Site Template Device Pool Assignment

**Location:** `supabase/migrations/20251118200000_device_site_assignment_functions.sql`
**Function:** `fn_assign_device_to_site` (lines 101-195)

**What it does:**
1. ❌ Updates ONLY `devices.site_id` (line 157)
2. ❌ Updates ONLY `devices.x_position`, `devices.y_position` (lines 158-159)
3. ❌ Does NOT create `device_site_assignments` record
4. ❌ Does NOT create `device_program_assignments` record
5. ⚠️ Comment says "program_id will be auto-populated by trigger" (line 154)

**Status:** ❌ **BROKEN** - Does not use junction tables

**Used by:**
- `src/components/sites/DeviceSetupStep.tsx` line 118
- Site template device drag-and-drop assignment

---

### Code Path 3: Device Edit Modal

**Location:** `src/components/devices/DeviceEditModal.tsx`

**Investigation needed:** Need to check if this updates assignments

---

## Data Inconsistencies Found

**Query Results:**
```
6 devices with mismatches:

LAB001-005: devices table has assignments, junction tables are EMPTY
TEST-DEVICE-002: devices table shows one site, junction shows different site
```

**Root Cause:** LAB devices were assigned via Site Template (Code Path 2), which didn't create junction records.

---

## Architecture Decision

**Junction tables MUST be the single source of truth.**

### Current State (BAD):
```
devices.site_id     = "current" assignment (maybe)
devices.program_id  = "current" assignment (maybe)
device_site_assignments = history (incomplete)
device_program_assignments = history (incomplete)
```

### Target State (GOOD):
```
device_site_assignments    = SOURCE OF TRUTH (active = current)
device_program_assignments = SOURCE OF TRUTH (active = current)
devices.site_id     = Cached copy of current (synced via trigger)
devices.program_id  = Cached copy of current (synced via trigger)
```

---

## Fix Strategy

### Phase 1: Fix Assignment Functions ⚠️ CRITICAL

**1. Fix `fn_assign_device_to_site`** to create junction records:
```sql
-- Add BEFORE updating devices table:
INSERT INTO device_site_assignments (
  device_id, site_id, program_id, is_active, is_primary, assigned_by_user_id
) VALUES (
  p_device_id, p_site_id, v_site_program_id, true, true, auth.uid()
);

INSERT INTO device_program_assignments (
  device_id, program_id, is_active, is_primary, assigned_by_user_id
) VALUES (
  p_device_id, v_site_program_id, true, true, auth.uid()
);
```

**2. Fix `fn_remove_device_from_site`** to deactivate junction records:
```sql
-- Add BEFORE updating devices table:
UPDATE device_site_assignments
SET is_active = false, unassigned_at = now(), unassigned_by_user_id = auth.uid()
WHERE device_id = p_device_id AND is_active = true;

UPDATE device_program_assignments
SET is_active = false, unassigned_at = now(), unassigned_by_user_id = auth.uid()
WHERE device_id = p_device_id AND is_active = true;
```

### Phase 2: Create Database Triggers

**Create trigger to sync `devices.site_id` FROM junction table:**
```sql
CREATE OR REPLACE FUNCTION trg_sync_device_assignment_from_junction()
RETURNS TRIGGER AS $$
BEGIN
  -- When junction record is activated
  IF (TG_OP = 'INSERT' AND NEW.is_active = true) OR
     (TG_OP = 'UPDATE' AND NEW.is_active = true AND OLD.is_active = false) THEN

    UPDATE devices
    SET
      site_id = (SELECT site_id FROM device_site_assignments
                 WHERE device_id = NEW.device_id AND is_active = true LIMIT 1),
      program_id = (SELECT program_id FROM device_program_assignments
                    WHERE device_id = NEW.device_id AND is_active = true LIMIT 1)
    WHERE device_id = NEW.device_id;
  END IF;

  -- When junction record is deactivated
  IF (TG_OP = 'UPDATE' AND NEW.is_active = false AND OLD.is_active = true) THEN
    UPDATE devices
    SET site_id = NULL, program_id = NULL
    WHERE device_id = NEW.device_id
      AND NOT EXISTS (
        SELECT 1 FROM device_site_assignments
        WHERE device_id = NEW.device_id AND is_active = true
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Phase 3: Update UI

**Fix Assignment card** in `DeviceDetailPage.tsx`:
```typescript
// Instead of: device.sites?.name (from devices.site_id JOIN)
// Use: Latest active junction record

const { data: currentAssignment } = await supabase
  .from('device_site_assignments')
  .select('site_id, sites(name), program_id, pilot_programs(name)')
  .eq('device_id', deviceId)
  .eq('is_active', true)
  .is('unassigned_at', null)
  .maybeSingle();
```

### Phase 4: Backfill Data

**Create backfill script for LAB devices:**
```sql
-- For each device with site_id but no junction record:
INSERT INTO device_site_assignments (
  device_id, site_id, program_id, is_active, is_primary,
  assigned_at, assigned_by_user_id
)
SELECT
  device_id, site_id, program_id, true, true,
  COALESCE(mapped_at, created_at), provisioned_by_user_id
FROM devices
WHERE site_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM device_site_assignments dsa
    WHERE dsa.device_id = devices.device_id
  );
```

---

## Files to Modify

### Database Migrations:
1. `supabase/migrations/NEW_fix_assignment_functions.sql`
   - Fix `fn_assign_device_to_site`
   - Fix `fn_remove_device_from_site`
   - Create sync trigger
   - Backfill missing records

### Frontend Code:
1. `src/hooks/useDevice.ts`
   - Add new hook `useDeviceCurrentAssignment` that queries junction tables
   - Keep existing `mapDeviceMutation` (already correct)

2. `src/pages/DeviceDetailPage.tsx`
   - Update Assignment card to use `useDeviceCurrentAssignment`
   - Show junction-based assignment

3. `src/components/devices/DeviceUnassignModal.tsx`
   - Verify it's using `mapDeviceMutation` correctly

---

## Testing Plan

1. ✅ Audit complete - mismatches identified
2. ⏳ Fix `fn_assign_device_to_site`
3. ⏳ Create sync triggers
4. ⏳ Backfill LAB devices
5. ⏳ Test assignment via Site Template
6. ⏳ Test reassignment via Device Detail
7. ⏳ Verify Assignment card shows correct data
8. ⏳ Verify Programs tab shows history

---

## Impact Analysis

**Before Fix:**
- Site Template assigns → No junction records → Session analytics broken
- Device reassign → Junction records created → Session analytics work
- Inconsistent behavior confuses users

**After Fix:**
- ALL assignments create junction records
- Assignment card always shows correct data
- Session analytics work for all devices
- Clean history in Programs tab
