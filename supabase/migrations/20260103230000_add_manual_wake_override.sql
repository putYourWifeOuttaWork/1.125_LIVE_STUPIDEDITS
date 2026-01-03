/*
  # Add Manual Wake Override Feature

  1. New Columns
    - manual_wake_override: Flag indicating next_wake_at is a manual override
    - manual_wake_requested_by: User who requested the manual wake
    - manual_wake_requested_at: When the override was set

  2. Purpose
    - Allow users to trigger one-off test wakes without disrupting schedule
    - Track who requested manual wakes for audit purposes
    - Clear flag after manual wake completes
    - Resume normal schedule after manual wake

  3. Usage
    - User sets next_wake_at to custom time (e.g., 1 minute from now)
    - Set manual_wake_override = true
    - Device wakes at custom time
    - Handler clears flag and calculates next wake from regular schedule
*/

-- Add manual wake override tracking columns
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS manual_wake_override BOOLEAN DEFAULT FALSE;

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS manual_wake_requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS manual_wake_requested_at TIMESTAMPTZ;

-- Create index for finding devices with manual overrides
CREATE INDEX IF NOT EXISTS idx_devices_manual_wake_override
  ON devices(manual_wake_override, next_wake_at)
  WHERE manual_wake_override = true;

-- Add helpful comments
COMMENT ON COLUMN devices.manual_wake_override IS 'True when next_wake_at is a one-time manual override, not calculated from schedule';
COMMENT ON COLUMN devices.manual_wake_requested_by IS 'User who requested the manual wake override';
COMMENT ON COLUMN devices.manual_wake_requested_at IS 'Timestamp when manual wake was requested';
