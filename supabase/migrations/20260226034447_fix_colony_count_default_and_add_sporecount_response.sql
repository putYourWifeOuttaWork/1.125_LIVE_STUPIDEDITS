/*
  # Fix colony_count default and add sporecount_response column

  1. Schema Changes
    - `device_images.colony_count`: Change default from 0 to NULL so we can
      distinguish "not scored" (NULL) from "scored as zero" (0)
    - `device_images.sporecount_response`: New JSONB column to store raw
      Roboflow sporecount API response for debugging
    - Set all existing colony_count = 0 rows to NULL (since the sporecount
      workflow has never returned a real count)

  2. Important Notes
    - Does NOT drop or rename any columns
    - Existing colony_count_velocity column is unchanged
*/

ALTER TABLE device_images
  ALTER COLUMN colony_count SET DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'sporecount_response'
  ) THEN
    ALTER TABLE device_images ADD COLUMN sporecount_response jsonb;
  END IF;
END $$;

UPDATE device_images SET colony_count = NULL WHERE colony_count = 0;
