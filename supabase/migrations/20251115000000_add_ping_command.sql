/*
  # Add Ping Command Type

  1. Changes
    - Add 'ping' to device_commands command_type enum
    - Allow users to send ping commands for testing connectivity

  2. Security
    - Update RLS policy to allow regular users to send ping commands
*/

-- Drop the existing constraint
ALTER TABLE device_commands DROP CONSTRAINT IF EXISTS device_commands_command_type_check;

-- Add new constraint with 'ping' included
ALTER TABLE device_commands ADD CONSTRAINT device_commands_command_type_check
CHECK (command_type IN ('capture_image', 'send_image', 'set_wake_schedule', 'update_config', 'reboot', 'update_firmware', 'ping'));

-- Allow regular users to create ping commands
CREATE POLICY "Users can create ping commands"
ON device_commands
FOR INSERT
TO authenticated
WITH CHECK (
  command_type = 'ping'
  AND created_by_user_id = auth.uid()
  AND device_id IN (
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

COMMENT ON COLUMN device_commands.command_type IS 'Type of command: capture_image, send_image, set_wake_schedule, update_config, reboot, update_firmware, ping';
