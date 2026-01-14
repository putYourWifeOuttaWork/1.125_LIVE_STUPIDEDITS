# Image Resume Migration - Step-by-Step Instructions

## Issue Detected

Your database has duplicate `(device_id, image_name)` records. This is preventing the UNIQUE constraint from being added.

**Example duplicate found:**
- Device ID: `57b7f85e-354f-4a51-a8f8-5aecff515768`
- Image Name: `image_10567.jpg`
- Multiple records exist for this combination

This is actually a **good thing** - it means we're catching and fixing real data integrity issues!

## Solution: Two-Step Migration

### Step 1: Clean Up Duplicates

**File:** `APPLY_IMAGE_RESUME_CLEANUP_FIRST.sql`

This script will:
1. Identify all duplicate (device_id, image_name) pairs
2. Keep the BEST version of each image based on:
   - Status priority: `complete` > `receiving` > `pending` > `failed`
   - Most recent `updated_at` timestamp
   - Highest `received_chunks` count
3. Backup all duplicates to `device_images_duplicates_backup` table
4. Delete the inferior duplicates
5. Verify no duplicates remain

**To Run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `APPLY_IMAGE_RESUME_CLEANUP_FIRST.sql`
3. Execute
4. Review the output showing what was deleted

**Expected Output:**
```
Found X duplicate image_name pairs
Deleted Y duplicate image records
Duplicates backed up to device_images_duplicates_backup table
✓ All duplicates cleaned up successfully
✓ Ready to apply IMAGE_RESUME_MIGRATION.sql
```

### Step 2: Apply Resume Migration

**File:** `APPLY_IMAGE_RESUME_MIGRATION.sql`

After cleanup, run the main migration which:
1. Adds UNIQUE constraint on `(device_id, image_name)`
2. Creates helper functions and tables
3. Enables resume functionality

**To Run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `APPLY_IMAGE_RESUME_MIGRATION.sql`
3. Execute
4. Verify success

**Expected Output:**
```
Added UNIQUE constraint on device_images(device_id, image_name)
=== Image Resume Migration Complete ===
Incomplete images in database: X
Duplicate logs recorded: 0
Resume system is now active!
```

## Why Duplicates Exist

Duplicates can occur when:
1. **Server restarts** during image transfer
2. **Firmware bugs** send same image_name twice
3. **Race conditions** in MQTT message handling
4. **Manual data fixes** created duplicate records

The image resume system prevents this in the future by:
- Enforcing UNIQUE constraint
- Detecting existing images before INSERT
- Updating existing records for resume instead of creating new ones

## Reviewing Duplicates Before Deletion

To see what will be deleted, you can query:

```sql
-- Show all duplicates and which will be kept
WITH ranked_images AS (
  SELECT
    d.device_code,
    di.device_id,
    di.image_name,
    di.image_id,
    di.status,
    di.received_chunks,
    di.total_chunks,
    di.captured_at,
    di.updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY di.device_id, di.image_name
      ORDER BY
        CASE di.status
          WHEN 'complete' THEN 1
          WHEN 'receiving' THEN 2
          WHEN 'pending' THEN 3
          WHEN 'failed' THEN 4
          ELSE 5
        END,
        di.updated_at DESC,
        di.received_chunks DESC,
        di.captured_at DESC
    ) as rank
  FROM device_images di
  JOIN devices d ON di.device_id = d.device_id
  WHERE (di.device_id, di.image_name) IN (
    SELECT device_id, image_name
    FROM device_images
    GROUP BY device_id, image_name
    HAVING COUNT(*) > 1
  )
)
SELECT
  device_code,
  image_name,
  status,
  received_chunks || '/' || total_chunks as chunks,
  captured_at,
  CASE WHEN rank = 1 THEN '✓ KEEP' ELSE '✗ DELETE' END as action
FROM ranked_images
ORDER BY device_code, image_name, rank;
```

## Recovering Deleted Records

If you need to recover a deleted duplicate:

```sql
-- View backed up records
SELECT
  d.device_code,
  b.image_name,
  b.status,
  b.received_chunks || '/' || b.total_chunks as chunks,
  b.captured_at,
  b.backed_up_at
FROM device_images_duplicates_backup b
JOIN devices d ON b.device_id = d.device_id
ORDER BY b.backed_up_at DESC;

-- Restore specific record (if needed)
INSERT INTO device_images (
  device_id, company_id, program_id, site_id,
  image_name, image_url, image_size, captured_at, received_at,
  total_chunks, received_chunks, status, error_code, metadata
)
SELECT
  device_id, company_id, program_id, site_id,
  image_name, image_url, image_size, captured_at, received_at,
  total_chunks, received_chunks, status, error_code, metadata
FROM device_images_duplicates_backup
WHERE backup_id = 'xxx-backup-id-xxx'
ON CONFLICT (device_id, image_name) DO NOTHING;
```

## Verification After Both Steps

After running both scripts:

```sql
-- 1. Verify no duplicates remain
SELECT device_id, image_name, COUNT(*) as count
FROM device_images
GROUP BY device_id, image_name
HAVING COUNT(*) > 1;
-- Should return 0 rows

-- 2. Verify constraint exists
SELECT conname, contype
FROM pg_constraint
WHERE conname = 'device_images_device_id_image_name_key';
-- Should return 1 row

-- 3. Check backed up records
SELECT COUNT(*) as backed_up_count
FROM device_images_duplicates_backup;
-- Shows how many duplicates were removed

-- 4. Verify helper functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_name IN (
  'fn_check_image_resumable',
  'fn_log_duplicate_image',
  'fn_wake_ingestion_handler'
);
-- Should return 3 rows
```

## Summary

**Current State:**
- ❌ Duplicates exist (blocking migration)
- ❌ Resume system not active

**After Step 1 (Cleanup):**
- ✅ Duplicates removed and backed up
- ⏳ Resume system not active yet

**After Step 2 (Migration):**
- ✅ No duplicates
- ✅ UNIQUE constraint enforced
- ✅ Resume system active
- ✅ Future duplicates prevented

## Next Steps

1. ✅ Run `APPLY_IMAGE_RESUME_CLEANUP_FIRST.sql`
2. ⏳ Run `APPLY_IMAGE_RESUME_MIGRATION.sql`
3. ⏳ Deploy updated code (mqtt-service and edge function)
4. ⏳ Test with real device

---

**Files Created:**
- `APPLY_IMAGE_RESUME_CLEANUP_FIRST.sql` - Removes duplicates safely
- `APPLY_IMAGE_RESUME_MIGRATION.sql` - Adds resume support (updated with better error handling)
- This file - Step-by-step instructions

**Documentation:**
- `IMAGE_RESUME_IMPLEMENTATION_COMPLETE.md` - Full technical details
- `DEPLOYMENT_INSTRUCTIONS_IMAGE_RESUME.md` - Deployment guide
