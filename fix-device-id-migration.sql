/*
  # Add device_id to petri_observations

  1. Changes
    - Add device_id column to petri_observations for efficient querying
    - Backfill device_id from submissions table
    - Add index for device_id + captured_at queries

  2. Purpose
    - Enable direct device → MGI score queries without joining through submissions
    - Support map visualization that needs latest MGI score per device
    - Improve query performance for MGI trends by device
*/

-- Add device_id column to petri_observations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petri_observations'
    AND column_name = 'device_id'
  ) THEN
    ALTER TABLE petri_observations
    ADD COLUMN device_id UUID REFERENCES devices(device_id) ON DELETE CASCADE;

    RAISE NOTICE 'Added device_id column to petri_observations';
  ELSE
    RAISE NOTICE 'device_id column already exists in petri_observations';
  END IF;
END $$;

-- Backfill device_id from submissions
UPDATE petri_observations po
SET device_id = sub.device_id
FROM submissions sub
WHERE po.submission_id = sub.submission_id
AND po.device_id IS NULL;

-- Add index for efficient device + MGI queries
CREATE INDEX IF NOT EXISTS idx_petri_observations_device_mgi
ON petri_observations(device_id, captured_at DESC)
WHERE mgi_score IS NOT NULL;

-- Add index for device + captured_at (for latest observation queries)
CREATE INDEX IF NOT EXISTS idx_petri_observations_device_captured
ON petri_observations(device_id, captured_at DESC);

-- Update comment
COMMENT ON COLUMN petri_observations.device_id IS 'Device that captured this observation (denormalized from submissions for efficient querying)';
