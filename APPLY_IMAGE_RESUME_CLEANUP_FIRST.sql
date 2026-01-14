/*
  # Image Resume - Pre-Migration Cleanup

  ## Purpose
  Clean up duplicate (device_id, image_name) records before adding UNIQUE constraint.

  ## Strategy
  - Keep the most complete/recent version of each image
  - Delete older duplicates
  - Log what was deleted for audit trail
*/

-- ==========================================
-- STEP 1: IDENTIFY DUPLICATES
-- ==========================================

DO $$
DECLARE
  v_duplicate_count INT;
BEGIN
  SELECT COUNT(*) INTO v_duplicate_count
  FROM (
    SELECT device_id, image_name, COUNT(*) as cnt
    FROM device_images
    GROUP BY device_id, image_name
    HAVING COUNT(*) > 1
  ) duplicates;

  RAISE NOTICE 'Found % duplicate image_name pairs', v_duplicate_count;
END $$;

-- Show the duplicates for review
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
  di.image_url
FROM device_images di
JOIN devices d ON di.device_id = d.device_id
WHERE (di.device_id, di.image_name) IN (
  SELECT device_id, image_name
  FROM device_images
  GROUP BY device_id, image_name
  HAVING COUNT(*) > 1
)
ORDER BY di.device_id, di.image_name, di.captured_at DESC;

-- ==========================================
-- STEP 2: CREATE TEMP TABLE FOR RECORDS TO DELETE
-- ==========================================

CREATE TEMP TABLE IF NOT EXISTS images_to_delete AS
WITH ranked_images AS (
  SELECT
    image_id,
    device_id,
    image_name,
    status,
    received_chunks,
    total_chunks,
    captured_at,
    updated_at,
    -- Rank by priority: complete > receiving > pending > failed
    -- Then by most recent update, then by most chunks received
    ROW_NUMBER() OVER (
      PARTITION BY device_id, image_name
      ORDER BY
        CASE status
          WHEN 'complete' THEN 1
          WHEN 'receiving' THEN 2
          WHEN 'pending' THEN 3
          WHEN 'failed' THEN 4
          ELSE 5
        END,
        updated_at DESC,
        received_chunks DESC,
        captured_at DESC
    ) as rank
  FROM device_images
  WHERE (device_id, image_name) IN (
    SELECT device_id, image_name
    FROM device_images
    GROUP BY device_id, image_name
    HAVING COUNT(*) > 1
  )
)
SELECT
  image_id,
  device_id,
  image_name,
  status,
  received_chunks,
  total_chunks,
  captured_at,
  updated_at
FROM ranked_images
WHERE rank > 1;  -- Keep rank=1 (best record), delete all others

-- Show what will be deleted
SELECT
  d.device_code,
  itd.image_name,
  itd.status,
  itd.received_chunks || '/' || itd.total_chunks as chunks,
  itd.captured_at,
  itd.updated_at
FROM images_to_delete itd
JOIN devices d ON itd.device_id = d.device_id
ORDER BY itd.device_id, itd.image_name, itd.captured_at;

-- ==========================================
-- STEP 3: BACKUP DUPLICATES BEFORE DELETION
-- ==========================================

-- Create backup table if not exists
CREATE TABLE IF NOT EXISTS device_images_duplicates_backup (
  backup_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backed_up_at TIMESTAMPTZ DEFAULT NOW(),

  -- Original columns
  image_id UUID,
  device_id UUID,
  company_id UUID,
  program_id UUID,
  site_id UUID,
  image_name TEXT,
  image_url TEXT,
  image_size INT,
  captured_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  total_chunks INT,
  received_chunks INT,
  status TEXT,
  error_code INT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,

  -- Reason for backup
  backup_reason TEXT DEFAULT 'Duplicate image_name cleanup before resume migration'
);

-- Insert duplicates into backup
INSERT INTO device_images_duplicates_backup (
  image_id, device_id, company_id, program_id, site_id,
  image_name, image_url, image_size, captured_at, received_at,
  total_chunks, received_chunks, status, error_code, metadata,
  created_at, updated_at
)
SELECT
  di.image_id, di.device_id, di.company_id, di.program_id, di.site_id,
  di.image_name, di.image_url, di.image_size, di.captured_at, di.received_at,
  di.total_chunks, di.received_chunks, di.status, di.error_code, di.metadata,
  di.created_at, di.updated_at
FROM device_images di
WHERE di.image_id IN (SELECT image_id FROM images_to_delete);

-- ==========================================
-- STEP 4: DELETE DUPLICATES
-- ==========================================

DO $$
DECLARE
  v_deleted_count INT;
BEGIN
  -- Delete duplicate records
  DELETE FROM device_images
  WHERE image_id IN (SELECT image_id FROM images_to_delete);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE NOTICE 'Deleted % duplicate image records', v_deleted_count;
  RAISE NOTICE 'Duplicates backed up to device_images_duplicates_backup table';
END $$;

-- ==========================================
-- STEP 5: VERIFY CLEANUP
-- ==========================================

DO $$
DECLARE
  v_remaining_duplicates INT;
BEGIN
  SELECT COUNT(*) INTO v_remaining_duplicates
  FROM (
    SELECT device_id, image_name, COUNT(*) as cnt
    FROM device_images
    GROUP BY device_id, image_name
    HAVING COUNT(*) > 1
  ) duplicates;

  IF v_remaining_duplicates > 0 THEN
    RAISE WARNING 'Still have % duplicate pairs - manual review needed!', v_remaining_duplicates;
  ELSE
    RAISE NOTICE '✓ All duplicates cleaned up successfully';
    RAISE NOTICE '✓ Ready to apply IMAGE_RESUME_MIGRATION.sql';
  END IF;
END $$;

-- Show summary
DO $$
DECLARE
  v_total_images INT;
  v_backed_up INT;
BEGIN
  SELECT COUNT(*) INTO v_total_images FROM device_images;
  SELECT COUNT(*) INTO v_backed_up FROM device_images_duplicates_backup;

  RAISE NOTICE '';
  RAISE NOTICE '=== Cleanup Summary ===';
  RAISE NOTICE 'Total images remaining: %', v_total_images;
  RAISE NOTICE 'Duplicates backed up: %', v_backed_up;
  RAISE NOTICE '';
  RAISE NOTICE 'Next step: Run APPLY_IMAGE_RESUME_MIGRATION.sql';
END $$;

-- Cleanup temp table
DROP TABLE IF EXISTS images_to_delete;
