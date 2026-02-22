/*
  # Add Device Archive Columns

  1. New Columns on `devices`
    - `archived_at` (timestamptz, nullable) - when set, the device is considered archived and hidden from mapping pools
    - `archived_by_user_id` (uuid, nullable, FK to auth.users) - audit trail of who archived the device
    - `archive_reason` (text, nullable) - reason for archiving (e.g. "Test device", "Decommissioned", "Security concern")

  2. Indexes
    - Partial index on `archived_at IS NULL` for fast pool queries

  3. Important Notes
    - Archive is orthogonal to provisioning_status; it simply hides the device from pools
    - When a device calls out via MQTT HELLO, archived_at is cleared automatically
    - No data is lost when archiving; all telemetry, images, and history are preserved
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'archived_at'
  ) THEN
    ALTER TABLE devices ADD COLUMN archived_at timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'archived_by_user_id'
  ) THEN
    ALTER TABLE devices ADD COLUMN archived_by_user_id uuid DEFAULT NULL REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'archive_reason'
  ) THEN
    ALTER TABLE devices ADD COLUMN archive_reason text DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_devices_not_archived
  ON devices (device_id)
  WHERE archived_at IS NULL;
