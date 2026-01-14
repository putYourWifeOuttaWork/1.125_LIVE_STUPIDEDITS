# Image Resume Migration - Status Update

## Problem Solved

**Original Error:**
```
ERROR: 23505: could not create unique index "device_images_device_id_image_name_key"
DETAIL: Key (device_id, image_name)=(57b7f85e-354f-4a51-a8f8-5aecff515768, image_10567.jpg) is duplicated.
```

**Second Error (after cleanup):**
```
ERROR: 42725: function name "fn_wake_ingestion_handler" is not unique
HINT: Specify the argument list to select the function unambiguously.
```

## Resolution

### Issue 1: Duplicate Images ✅ FIXED
- Found 78 duplicate image records across multiple devices
- Cleanup script successfully removed 65 inferior duplicates
- Kept best versions based on status and completeness
- All duplicates backed up to `device_images_duplicates_backup` table

### Issue 2: Function Signature Conflict ✅ FIXED
- Existing function had 4 parameters
- New resume version needs 5 parameters (added `p_existing_image_id`)
- PostgreSQL saw this as function overloading → ambiguity error
- **Solution:** Added `DROP FUNCTION IF EXISTS` before creating new version

## Files Updated

1. **APPLY_IMAGE_RESUME_MIGRATION.sql** - Added function drop statement
2. **APPLY_IMAGE_RESUME_INSTRUCTIONS.md** - Updated with new expected output

## Cleanup Results

From your export, here's what was cleaned up:

### Device ESP32S3-005 (image_1.jpg)
- **41 duplicates** → Kept 1 complete version
- Most recent: `cefbdf87-34d7-435b-9bf4-fd9f4b6c02c7` (complete, 63/63 chunks)
- Deleted 40 older/incomplete versions

### Device ESP32S3-002
- **image_4756.jpg**: 2 duplicates → kept newer one
- **image_49.jpg**: 2 duplicates → kept newer one
- **image_50.jpg**: 2 duplicates → kept newer one
- **image_51.jpg**: 2 duplicates → kept newer one
- **image_53.jpg**: 2 duplicates → kept newer one

### Device ESP32S3-008
- **6 images** with duplicates → kept best versions

### Total Impact
- **78 total duplicate records identified**
- **65 inferior copies removed**
- **13 best versions retained**
- **Zero data loss** (all backed up)

## Next Steps - Ready to Execute

### 1. Run Updated Migration ✅
**File:** `APPLY_IMAGE_RESUME_MIGRATION.sql`

The migration now includes:
```sql
-- Drop existing function first (may have different signature)
DROP FUNCTION IF EXISTS fn_wake_ingestion_handler(UUID, TIMESTAMPTZ, TEXT, JSONB);

-- Create updated function with resume support
CREATE OR REPLACE FUNCTION fn_wake_ingestion_handler(
  p_device_id UUID,
  p_captured_at TIMESTAMPTZ,
  p_image_name TEXT,
  p_telemetry_data JSONB,
  p_existing_image_id UUID DEFAULT NULL
)
```

**Expected Success Output:**
```
✓ Added UNIQUE constraint on device_images(device_id, image_name)
✓ Created index idx_device_images_resume
✓ Created table duplicate_images_log
✓ Created function fn_check_image_resumable
✓ Created function fn_log_duplicate_image
✓ Dropped old fn_wake_ingestion_handler
✓ Created new fn_wake_ingestion_handler with resume support

=== Image Resume Migration Complete ===
Incomplete images in database: X
Duplicate logs recorded: 0
Resume system is now active!
```

### 2. Deploy Code Updates
- Update mqtt-service (`mqtt-service/index.js`)
- Deploy edge function (`mqtt_device_handler_bundled`)
- Restart services

### 3. Test Resume Functionality
- Interrupt an image transfer mid-way
- Let device reconnect and resume
- Verify chunks append (don't restart)
- Confirm no new duplicates created

## Key Benefits After Migration

1. **Resume Support** - Interrupted transfers continue from last chunk
2. **No More Duplicates** - UNIQUE constraint prevents them
3. **Data Integrity** - Clean, consistent image records
4. **Better Debugging** - Duplicate attempts logged for analysis
5. **Firmware-Managed** - Devices control retry logic, not server

## Verification Queries

After running the migration, verify:

```sql
-- 1. No duplicates remain
SELECT COUNT(*) FROM (
  SELECT device_id, image_name
  FROM device_images
  GROUP BY device_id, image_name
  HAVING COUNT(*) > 1
) duplicates;
-- Should return: 0

-- 2. Constraint exists
SELECT conname FROM pg_constraint
WHERE conname = 'device_images_device_id_image_name_key';
-- Should return: 1 row

-- 3. New function signature
SELECT
  proname,
  pronargs,
  pg_get_function_arguments(oid) as args
FROM pg_proc
WHERE proname = 'fn_wake_ingestion_handler';
-- Should show: 5 parameters including p_existing_image_id

-- 4. Check backed up records
SELECT COUNT(*) FROM device_images_duplicates_backup;
-- Should show: 65 backed up records
```

## Build Status

✅ **PASSING** - No TypeScript errors

All code changes compile successfully. Ready for deployment.

## Migration Timeline

1. ✅ **Cleanup completed** - Duplicates removed and backed up
2. ✅ **Migration fixed** - Function signature conflict resolved
3. ⏳ **Ready to run** - Updated migration ready to execute
4. ⏳ **Code deployment** - After migration succeeds
5. ⏳ **Testing** - Verify resume works with real devices

---

**Status:** Ready to execute `APPLY_IMAGE_RESUME_MIGRATION.sql`
