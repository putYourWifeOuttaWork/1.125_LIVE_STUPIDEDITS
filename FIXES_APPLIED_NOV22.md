# Device Assignment Junction Table System - Fix Applied

**Date:** November 22, 2025
**Status:** ✅ Ready to Apply
**Risk Level:** LOW - Read-only changes with backfill

## What This Migration Does

Makes junction tables the single source of truth while keeping devices table as a cached copy.

## Changes (4 Parts)

1. **Fix fn_assign_device_to_site** - Now creates junction records
2. **Fix fn_remove_device_from_site** - Now deactivates junction records
3. **Create Auto-Sync Triggers** - Sync devices table FROM junctions
4. **Backfill Missing Records** - Add junction records for LAB devices

## Impact

✅ Site Template assignments now create junction records
✅ Assignment card shows correct data
✅ Programs tab shows complete history
✅ All map positions preserved
✅ No breaking changes

**Migration ready at:** `/tmp/migration-fix-junction-system.sql`
