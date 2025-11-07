/*
  # Modify Submissions Table for IoT Device Support

  1. Changes
    - Add `created_by_device_id` column to link device-generated submissions
    - Add `is_device_generated` flag to distinguish automated submissions
    - Add index on created_by_device_id for performance
    - Add RLS policy for device-generated submissions

  2. Purpose
    - Enable IoT devices to create submissions automatically
    - Distinguish between human and device-generated submissions
    - Maintain data integrity with proper foreign keys

  3. Notes
    - Device-generated submissions don't require session management
    - Submissions can be created by either user OR device (not both)
    - Device-generated submissions are marked complete immediately
*/

-- Add new columns to submissions table
DO $$
BEGIN
  -- Add created_by_device_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'created_by_device_id'
  ) THEN
    ALTER TABLE submissions ADD COLUMN created_by_device_id UUID REFERENCES devices(device_id) ON DELETE SET NULL;
  END IF;

  -- Add is_device_generated flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'is_device_generated'
  ) THEN
    ALTER TABLE submissions ADD COLUMN is_device_generated BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Create index for device-generated submissions
CREATE INDEX IF NOT EXISTS idx_submissions_device ON submissions(created_by_device_id);
CREATE INDEX IF NOT EXISTS idx_submissions_device_generated ON submissions(is_device_generated) WHERE is_device_generated = true;

-- Add constraint: submission must have either created_by OR created_by_device_id, not both
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'submissions_creator_check'
  ) THEN
    ALTER TABLE submissions ADD CONSTRAINT submissions_creator_check
    CHECK (
      (created_by IS NOT NULL AND created_by_device_id IS NULL) OR
      (created_by IS NULL AND created_by_device_id IS NOT NULL)
    );
  END IF;
END $$;

-- Add RLS policy for viewing device-generated submissions
CREATE POLICY "Users can view device-generated submissions in their programs"
ON submissions
FOR SELECT
TO authenticated
USING (
  is_device_generated = true
  AND (
    site_id IN (
      SELECT site_id FROM sites
      WHERE program_id IN (
        SELECT program_id FROM pilot_program_users
        WHERE user_id = auth.uid()
      )
    )
    OR program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    )
  )
);

-- Prevent users from editing device-generated submissions (only admins can)
CREATE POLICY "Only admins can edit device-generated submissions"
ON submissions
FOR UPDATE
TO authenticated
USING (
  is_device_generated = true
  AND (
    auth.uid() IN (
      SELECT id FROM users WHERE is_company_admin = true
    )
    OR program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
      AND role = 'Admin'
    )
  )
)
WITH CHECK (
  is_device_generated = true
  AND (
    auth.uid() IN (
      SELECT id FROM users WHERE is_company_admin = true
    )
    OR program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
      AND role = 'Admin'
    )
  )
);

-- Add helpful comments
COMMENT ON COLUMN submissions.created_by_device_id IS 'Device that automatically generated this submission (mutually exclusive with created_by)';
COMMENT ON COLUMN submissions.is_device_generated IS 'Flag indicating this submission was created automatically by an IoT device';
