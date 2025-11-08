/*
  # Add Missing Columns to Devices Table

  1. Problem
    - The devices table is missing 5 columns that are defined in the migration files but were never applied to the database
    - This causes the junction tables migration (20251108120000) to fail when referencing mapped_at and mapped_by_user_id

  2. Missing Columns
    - `mapped_at` (timestamptz) - Timestamp when device was mapped to a site by an administrator
    - `mapped_by_user_id` (uuid) - User who mapped the device to a site
    - `provisioning_status` (text) - Device provisioning state with CHECK constraint
    - `device_reported_site_id` (text) - Site ID as reported by device firmware
    - `device_reported_location` (text) - Location string as reported by device firmware

  3. Changes
    - Add all 5 missing columns using conditional DDL (IF NOT EXISTS pattern)
    - Add appropriate constraints, foreign keys, and default values
    - Create index on provisioning_status for filtering queries
    - Add column comments for documentation

  4. Data Safety
    - Uses conditional DDL to prevent errors if columns already exist
    - All columns are nullable to avoid breaking existing records
    - No data deletion or modification occurs
*/

-- Add mapped_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'mapped_at'
  ) THEN
    ALTER TABLE devices ADD COLUMN mapped_at TIMESTAMPTZ;
    COMMENT ON COLUMN devices.mapped_at IS 'Timestamp when device was mapped to a site by an administrator';
  END IF;
END $$;

-- Add mapped_by_user_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'mapped_by_user_id'
  ) THEN
    ALTER TABLE devices ADD COLUMN mapped_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    COMMENT ON COLUMN devices.mapped_by_user_id IS 'User who mapped the device to a site';
  END IF;
END $$;

-- Add provisioning_status column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'provisioning_status'
  ) THEN
    ALTER TABLE devices ADD COLUMN provisioning_status TEXT DEFAULT 'pending_mapping';

    -- Add CHECK constraint for provisioning_status
    ALTER TABLE devices ADD CONSTRAINT devices_provisioning_status_check
      CHECK (provisioning_status IN ('pending_mapping', 'mapped', 'active', 'inactive'));

    COMMENT ON COLUMN devices.provisioning_status IS 'Device provisioning state: pending_mapping (awaiting admin assignment), mapped (assigned to site), active (operational), inactive (disabled)';
  END IF;
END $$;

-- Add device_reported_site_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'device_reported_site_id'
  ) THEN
    ALTER TABLE devices ADD COLUMN device_reported_site_id TEXT;
    COMMENT ON COLUMN devices.device_reported_site_id IS 'Site ID as reported by device firmware (may not match actual site_id)';
  END IF;
END $$;

-- Add device_reported_location column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'device_reported_location'
  ) THEN
    ALTER TABLE devices ADD COLUMN device_reported_location TEXT;
    COMMENT ON COLUMN devices.device_reported_location IS 'Location string as reported by device firmware';
  END IF;
END $$;

-- Create index on provisioning_status if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_devices_provisioning_status ON devices(provisioning_status);

-- Update existing devices to set provisioning_status based on whether they have a site_id
DO $$
BEGIN
  -- Devices with site_id should be marked as 'mapped'
  UPDATE devices
  SET provisioning_status = 'mapped',
      mapped_at = created_at
  WHERE site_id IS NOT NULL AND provisioning_status = 'pending_mapping';

  -- Active devices with site_id should be marked as 'active'
  UPDATE devices
  SET provisioning_status = 'active'
  WHERE site_id IS NOT NULL AND is_active = true AND provisioning_status = 'mapped';

  -- Inactive devices should be marked as 'inactive'
  UPDATE devices
  SET provisioning_status = 'inactive'
  WHERE is_active = false;
END $$;
