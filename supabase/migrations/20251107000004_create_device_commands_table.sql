/*
  # Create Device Commands Table

  1. New Tables
    - `device_commands`
      - `command_id` (uuid, primary key)
      - `device_id` (uuid, FK) - Target device
      - `command_type` (text) - Type of command
      - `command_payload` (jsonb) - Command parameters
      - `issued_at` (timestamptz) - When command was issued
      - `delivered_at` (timestamptz) - When command was sent to device
      - `acknowledged_at` (timestamptz) - When device acknowledged
      - `status` (text) - 'pending', 'sent', 'acknowledged', 'failed'
      - `retry_count` (integer) - Number of retry attempts
      - `created_by_user_id` (uuid, FK) - User who issued command
      - `notes` (text) - Optional notes

  2. Command Types
    - 'capture_image' - Request device to capture new image
    - 'send_image' - Request device to send specific image
    - 'set_wake_schedule' - Update wake schedule
    - 'update_config' - Update device configuration

  3. Security
    - Enable RLS on `device_commands` table
    - Add policies for viewing commands (users with device access)
    - Only company admins can issue commands

  4. Indexes
    - Index on device_id for device-specific queries
    - Index on status for querying pending commands
*/

-- Create device_commands table
CREATE TABLE IF NOT EXISTS device_commands (
  command_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  command_type TEXT NOT NULL CHECK (command_type IN ('capture_image', 'send_image', 'set_wake_schedule', 'update_config', 'reboot', 'update_firmware')),
  command_payload JSONB,
  issued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  delivered_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'acknowledged', 'failed', 'expired')),
  retry_count INTEGER DEFAULT 0,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_commands_device ON device_commands(device_id);
CREATE INDEX IF NOT EXISTS idx_device_commands_status ON device_commands(status);
CREATE INDEX IF NOT EXISTS idx_device_commands_issued ON device_commands(issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_commands_device_status ON device_commands(device_id, status);

-- Enable Row Level Security
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;

-- Users can view commands for devices in their accessible programs
CREATE POLICY "Users can view device commands in their programs"
ON device_commands
FOR SELECT
TO authenticated
USING (
  device_id IN (
    SELECT device_id
    FROM devices
    WHERE program_id IN (
      SELECT program_id
      FROM pilot_program_users
      WHERE user_id = auth.uid()
    )
    OR site_id IN (
      SELECT site_id
      FROM sites
      WHERE program_id IN (
        SELECT program_id
        FROM pilot_program_users
        WHERE user_id = auth.uid()
      )
    )
  )
);

-- Only company admins can issue commands
CREATE POLICY "Company admins can create device commands"
ON device_commands
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IN (
    SELECT id
    FROM users
    WHERE is_company_admin = true
  )
  AND created_by_user_id = auth.uid()
);

-- Only company admins can update commands (for status tracking)
CREATE POLICY "Company admins can update device commands"
ON device_commands
FOR UPDATE
TO authenticated
USING (
  auth.uid() IN (
    SELECT id
    FROM users
    WHERE is_company_admin = true
  )
);

-- Add helpful comments
COMMENT ON TABLE device_commands IS 'Queue of commands to be sent to IoT devices via MQTT';
COMMENT ON COLUMN device_commands.command_type IS 'Type of command: capture_image, send_image, set_wake_schedule, update_config, reboot, update_firmware';
COMMENT ON COLUMN device_commands.command_payload IS 'JSON payload specific to command type (e.g., {"image_name": "image_001.jpg"} for send_image)';
COMMENT ON COLUMN device_commands.status IS 'pending: not sent, sent: published to MQTT, acknowledged: device confirmed, failed: error, expired: timeout';
COMMENT ON COLUMN device_commands.delivered_at IS 'Timestamp when command was published to MQTT topic';
COMMENT ON COLUMN device_commands.acknowledged_at IS 'Timestamp when device sent ACK response';
