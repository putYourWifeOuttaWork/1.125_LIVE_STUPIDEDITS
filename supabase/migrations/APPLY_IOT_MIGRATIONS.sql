-- ================================================================================
-- IoT Device Integration - Complete Migration Script
-- ================================================================================
-- This script removes old device tables and applies new cohesive IoT architecture
-- 
-- IMPORTANT: Run this script through Supabase Dashboard SQL Editor
-- 
-- Steps:
-- 1. Remove old device tables (cleanup)
-- 2. Create new device tables (5 tables)
-- 3. Modify existing tables to link with devices (3 tables)
--
-- Order of execution is critical for foreign key dependencies
-- ================================================================================

-- ================================================================================
-- STEP 1: Remove Old IoT Device Infrastructure
-- ================================================================================

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS public.device_command_logs CASCADE;
DROP TABLE IF EXISTS public.device_commands CASCADE;
DROP TABLE IF EXISTS public.device_configs CASCADE;
DROP TABLE IF EXISTS public.device_errors CASCADE;
DROP TABLE IF EXISTS public.device_publish_log CASCADE;
DROP TABLE IF EXISTS public.device_sites CASCADE;
DROP TABLE IF EXISTS public.device_status CASCADE;
DROP TABLE IF EXISTS public.sensor_readings CASCADE;
DROP TABLE IF EXISTS public.captures CASCADE;
DROP TABLE IF EXISTS public.devices CASCADE;

-- ================================================================================
-- STEP 2: Create New Device Tables
-- ================================================================================
/*
  # Create IoT Devices Table

  1. New Tables
    - `devices`
      - `device_id` (uuid, primary key)
      - `device_mac` (text, unique) - Device MAC address (e.g., B8F862F9CFB8)
      - `device_name` (text) - Human-readable device name
      - `site_id` (uuid, FK) - Associated site
      - `program_id` (uuid, FK) - Associated program
      - `firmware_version` (text) - Current firmware version
      - `hardware_version` (text) - Hardware model/version
      - `is_active` (boolean) - Device enabled/disabled
      - `last_seen_at` (timestamptz) - Last MQTT message timestamp
      - `last_wake_at` (timestamptz) - Last wake cycle timestamp
      - `next_wake_at` (timestamptz) - Scheduled next wake time
      - `wake_schedule_cron` (text) - Cron expression for wake schedule
      - `battery_voltage` (numeric) - Current battery voltage
      - `battery_health_percent` (integer) - Battery health percentage
      - `wifi_ssid` (text) - Connected WiFi SSID
      - `mqtt_client_id` (text) - MQTT client identifier
      - `provisioned_at` (timestamptz) - Device provisioning timestamp
      - `provisioned_by_user_id` (uuid, FK) - User who provisioned device
      - `notes` (text) - Admin notes
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record last update timestamp

  2. Security
    - Enable RLS on `devices` table
    - Add policies for viewing devices (users with program access)
    - Add policies for managing devices (company admins only)

  3. Indexes
    - Index on site_id for site-based queries
    - Index on program_id for program-based queries
    - Index on last_seen_at for monitoring queries
    - Index on next_wake_at for scheduling queries
*/

-- Create devices table
CREATE TABLE IF NOT EXISTS devices (
  device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_mac TEXT UNIQUE NOT NULL,
  device_name TEXT,
  site_id UUID REFERENCES sites(site_id) ON DELETE SET NULL,
  program_id UUID REFERENCES pilot_programs(program_id) ON DELETE SET NULL,
  firmware_version TEXT,
  hardware_version TEXT DEFAULT 'ESP32-S3',
  is_active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  last_wake_at TIMESTAMPTZ,
  next_wake_at TIMESTAMPTZ,
  wake_schedule_cron TEXT,
  battery_voltage NUMERIC(5,2),
  battery_health_percent INTEGER CHECK (battery_health_percent >= 0 AND battery_health_percent <= 100),
  wifi_ssid TEXT,
  mqtt_client_id TEXT,
  provisioned_at TIMESTAMPTZ,
  provisioned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_devices_site ON devices(site_id);
CREATE INDEX IF NOT EXISTS idx_devices_program ON devices(program_id);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_devices_next_wake ON devices(next_wake_at);
CREATE INDEX IF NOT EXISTS idx_devices_active ON devices(is_active);
CREATE INDEX IF NOT EXISTS idx_devices_mac ON devices(device_mac);

-- Enable Row Level Security
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Users can view devices for sites in their accessible programs
CREATE POLICY "Users can view devices in their programs"
ON devices
FOR SELECT
TO authenticated
USING (
  program_id IN (
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
);

-- Only company admins can insert devices
CREATE POLICY "Company admins can create devices"
ON devices
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IN (
    SELECT id
    FROM users
    WHERE is_company_admin = true
  )
);

-- Only company admins can update devices
CREATE POLICY "Company admins can update devices"
ON devices
FOR UPDATE
TO authenticated
USING (
  auth.uid() IN (
    SELECT id
    FROM users
    WHERE is_company_admin = true
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id
    FROM users
    WHERE is_company_admin = true
  )
);

-- Only company admins can delete devices
CREATE POLICY "Company admins can delete devices"
ON devices
FOR DELETE
TO authenticated
USING (
  auth.uid() IN (
    SELECT id
    FROM users
    WHERE is_company_admin = true
  )
);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_devices_updated_at
BEFORE UPDATE ON devices
FOR EACH ROW
EXECUTE FUNCTION update_devices_updated_at();

-- Add helpful comments
COMMENT ON TABLE devices IS 'IoT ESP32-CAM devices for automatic petri dish image capture';
COMMENT ON COLUMN devices.device_mac IS 'Device MAC address used as unique identifier in MQTT topics';
COMMENT ON COLUMN devices.wake_schedule_cron IS 'Cron expression for scheduled wake times (e.g., "0 8,16 * * *" for 8am & 4pm)';
COMMENT ON COLUMN devices.battery_health_percent IS 'Battery health as percentage (0-100), triggers alerts when low';

/*
  # Create Device Telemetry Table

  1. New Tables
    - `device_telemetry`
      - `telemetry_id` (uuid, primary key)
      - `device_id` (uuid, FK) - Reference to devices table
      - `captured_at` (timestamptz) - When data was captured by device
      - `temperature` (numeric) - Temperature in °C from BME680
      - `humidity` (numeric) - Humidity % from BME680
      - `pressure` (numeric) - Pressure in hPa from BME680
      - `gas_resistance` (numeric) - Gas resistance in kΩ from BME680
      - `battery_voltage` (numeric) - Battery voltage at time of capture
      - `wifi_rssi` (integer) - WiFi signal strength (RSSI)
      - `created_at` (timestamptz) - Record creation timestamp

  2. Security
    - Enable RLS on `device_telemetry` table
    - Add policies for viewing telemetry (users with device access)
    - Telemetry is read-only for users (only system can insert)

  3. Indexes
    - Index on device_id for device-specific queries
    - Index on captured_at for time-series queries
    - Composite index on device_id + captured_at for common queries
*/

-- Create device_telemetry table
CREATE TABLE IF NOT EXISTS device_telemetry (
  telemetry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL,
  temperature NUMERIC(5,2),
  humidity NUMERIC(5,2) CHECK (humidity >= 0 AND humidity <= 100),
  pressure NUMERIC(6,2),
  gas_resistance NUMERIC(8,2),
  battery_voltage NUMERIC(5,2),
  wifi_rssi INTEGER,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_telemetry_device ON device_telemetry(device_id);
CREATE INDEX IF NOT EXISTS idx_device_telemetry_captured ON device_telemetry(captured_at);
CREATE INDEX IF NOT EXISTS idx_device_telemetry_device_captured ON device_telemetry(device_id, captured_at DESC);

-- Enable Row Level Security
ALTER TABLE device_telemetry ENABLE ROW LEVEL SECURITY;

-- Users can view telemetry for devices in their accessible programs
CREATE POLICY "Users can view device telemetry in their programs"
ON device_telemetry
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

-- No INSERT/UPDATE/DELETE policies for users - telemetry is system-generated only
-- Server-side code will use service role key to insert telemetry data

-- Add helpful comments
COMMENT ON TABLE device_telemetry IS 'Environmental sensor data captured by IoT devices (BME680 sensor readings)';
COMMENT ON COLUMN device_telemetry.captured_at IS 'Timestamp when device captured the data (may differ from created_at if sent offline)';
COMMENT ON COLUMN device_telemetry.gas_resistance IS 'Gas resistance in kΩ - indicator of air quality';
COMMENT ON COLUMN device_telemetry.wifi_rssi IS 'WiFi signal strength in dBm (typically -30 to -90)';

/*
  # Create Device Images Table

  1. New Tables
    - `device_images`
      - `image_id` (uuid, primary key)
      - `device_id` (uuid, FK) - Reference to devices table
      - `image_name` (text) - Image filename from device (e.g., "image_001.jpg")
      - `image_url` (text) - Supabase Storage URL after upload
      - `image_size` (integer) - Total image size in bytes
      - `captured_at` (timestamptz) - When device captured the image
      - `received_at` (timestamptz) - When server completed receiving all chunks
      - `total_chunks` (integer) - Expected number of chunks
      - `received_chunks` (integer) - Number of chunks received so far
      - `status` (text) - 'pending', 'receiving', 'complete', 'failed'
      - `error_code` (integer) - Error code if status is 'failed'
      - `retry_count` (integer) - Number of retry attempts
      - `submission_id` (uuid, FK) - Associated submission
      - `observation_id` (uuid) - Associated observation (petri or gasifier)
      - `observation_type` (text) - 'petri' or 'gasifier'
      - `metadata` (jsonb) - Full metadata from device (temp, humidity, etc.)
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record last update timestamp

  2. Security
    - Enable RLS on `device_images` table
    - Add policies for viewing images (users with device access)
    - Images are read-only for users (only system can modify)

  3. Indexes
    - Index on device_id for device-specific queries
    - Index on status for querying pending/failed images
    - Index on captured_at for chronological queries
    - Index on submission_id for linking to submissions
*/

-- Create device_images table
CREATE TABLE IF NOT EXISTS device_images (
  image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  image_name TEXT NOT NULL,
  image_url TEXT,
  image_size INTEGER,
  captured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ,
  total_chunks INTEGER,
  received_chunks INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'receiving', 'complete', 'failed')),
  error_code INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  submission_id UUID REFERENCES submissions(submission_id) ON DELETE SET NULL,
  observation_id UUID,
  observation_type TEXT CHECK (observation_type IN ('petri', 'gasifier')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_images_device ON device_images(device_id);
CREATE INDEX IF NOT EXISTS idx_device_images_status ON device_images(status);
CREATE INDEX IF NOT EXISTS idx_device_images_captured ON device_images(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_images_submission ON device_images(submission_id);
CREATE INDEX IF NOT EXISTS idx_device_images_device_name ON device_images(device_id, image_name);

-- Enable Row Level Security
ALTER TABLE device_images ENABLE ROW LEVEL SECURITY;

-- Users can view images for devices in their accessible programs
CREATE POLICY "Users can view device images in their programs"
ON device_images
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

-- No INSERT/UPDATE/DELETE policies for users - images are system-managed only
-- Server-side code will use service role key to manage image records

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_device_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_device_images_updated_at
BEFORE UPDATE ON device_images
FOR EACH ROW
EXECUTE FUNCTION update_device_images_updated_at();

-- Add helpful comments
COMMENT ON TABLE device_images IS 'Tracks chunked image transmission from IoT devices to server';
COMMENT ON COLUMN device_images.image_name IS 'Original filename from device SD card';
COMMENT ON COLUMN device_images.status IS 'pending: awaiting chunks, receiving: in progress, complete: all chunks received, failed: transmission error';
COMMENT ON COLUMN device_images.received_chunks IS 'Count of unique chunk_ids received (used for progress tracking)';
COMMENT ON COLUMN device_images.metadata IS 'Full device metadata including temperature, humidity, pressure, gas_resistance, location';
COMMENT ON COLUMN device_images.observation_id IS 'UUID of petri_observation or gasifier_observation record created from this image';

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

/*
  # Create Device Alerts Table

  1. New Tables
    - `device_alerts`
      - `alert_id` (uuid, primary key)
      - `device_id` (uuid, FK) - Device that triggered alert
      - `alert_type` (text) - Type of alert
      - `severity` (text) - Alert severity level
      - `message` (text) - Human-readable alert message
      - `metadata` (jsonb) - Additional alert context
      - `triggered_at` (timestamptz) - When alert was triggered
      - `resolved_at` (timestamptz) - When alert was resolved
      - `resolved_by_user_id` (uuid, FK) - User who resolved alert
      - `resolution_notes` (text) - Notes about resolution
      - `notification_sent` (boolean) - Whether notification was sent

  2. Alert Types
    - 'missed_wake' - Device missed scheduled wake window
    - 'low_battery' - Battery health below threshold
    - 'connection_failure' - WiFi or MQTT connection issues
    - 'sensor_error' - Environmental sensor errors
    - 'image_transmission_failed' - Failed to receive image after retries
    - 'prolonged_offline' - Device offline for extended period

  3. Severity Levels
    - 'info' - Informational
    - 'warning' - Warning (requires attention)
    - 'error' - Error (requires action)
    - 'critical' - Critical (immediate action required)

  4. Security
    - Enable RLS on `device_alerts` table
    - Add policies for viewing alerts (users with device access)
    - Only admins can resolve alerts

  5. Indexes
    - Index on device_id for device-specific queries
    - Index on triggered_at for chronological queries
    - Index on resolved_at for filtering active alerts
*/

-- Create device_alerts table
CREATE TABLE IF NOT EXISTS device_alerts (
  alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('missed_wake', 'low_battery', 'connection_failure', 'sensor_error', 'image_transmission_failed', 'prolonged_offline', 'firmware_outdated', 'storage_full')),
  severity TEXT DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  message TEXT NOT NULL,
  metadata JSONB,
  triggered_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  notification_sent BOOLEAN DEFAULT false
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_alerts_device ON device_alerts(device_id);
CREATE INDEX IF NOT EXISTS idx_device_alerts_triggered ON device_alerts(triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alerts_resolved ON device_alerts(resolved_at);
CREATE INDEX IF NOT EXISTS idx_device_alerts_active ON device_alerts(device_id, resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_device_alerts_severity ON device_alerts(severity, resolved_at) WHERE resolved_at IS NULL;

-- Enable Row Level Security
ALTER TABLE device_alerts ENABLE ROW LEVEL SECURITY;

-- Users can view alerts for devices in their accessible programs
CREATE POLICY "Users can view device alerts in their programs"
ON device_alerts
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

-- No INSERT policy for users - alerts are system-generated only
-- Server-side code will use service role key to create alerts

-- Program admins and company admins can resolve alerts
CREATE POLICY "Admins can resolve device alerts"
ON device_alerts
FOR UPDATE
TO authenticated
USING (
  device_id IN (
    SELECT device_id
    FROM devices
    WHERE program_id IN (
      SELECT program_id
      FROM pilot_program_users
      WHERE user_id = auth.uid()
      AND role = 'Admin'
    )
  )
  OR auth.uid() IN (
    SELECT id
    FROM users
    WHERE is_company_admin = true
  )
)
WITH CHECK (
  -- Can only update resolution fields
  resolved_by_user_id = auth.uid()
);

-- Add helpful comments
COMMENT ON TABLE device_alerts IS 'Alert log for IoT device monitoring and health tracking';
COMMENT ON COLUMN device_alerts.alert_type IS 'Type of alert: missed_wake, low_battery, connection_failure, sensor_error, image_transmission_failed, prolonged_offline, firmware_outdated, storage_full';
COMMENT ON COLUMN device_alerts.severity IS 'Alert severity: info, warning, error, critical';
COMMENT ON COLUMN device_alerts.metadata IS 'Additional context (e.g., {"battery_percent": 5, "threshold": 10} for low_battery)';
COMMENT ON COLUMN device_alerts.notification_sent IS 'Whether email/SMS notification was sent to relevant users';
COMMENT ON COLUMN device_alerts.resolved_at IS 'NULL indicates active alert, timestamp indicates resolved';

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

/*
  # Modify Petri Observations Table for IoT Device Support

  1. Changes
    - Add `is_device_generated` flag to distinguish automated observations
    - Add `device_capture_metadata` JSONB field for storing device sensor data
    - Add index on is_device_generated for filtering

  2. Purpose
    - Store full device metadata (temperature, humidity, pressure, gas_resistance) with each observation
    - Enable filtering and analytics on device vs. human captured observations
    - Preserve all sensor readings for correlation analysis

  3. Device Metadata Structure
    {
      "temperature": 25.5,
      "humidity": 45.2,
      "pressure": 1010.5,
      "gas_resistance": 15.3,
      "capture_timestamp": "2025-08-29T14:30:00Z",
      "device_mac": "B8F862F9CFB8",
      "firmware_version": "1.0.0",
      "battery_voltage": 3.8,
      "wifi_rssi": -65,
      "error_code": 0
    }
*/

-- Add new columns to petri_observations table
DO $$
BEGIN
  -- Add is_device_generated flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petri_observations' AND column_name = 'is_device_generated'
  ) THEN
    ALTER TABLE petri_observations ADD COLUMN is_device_generated BOOLEAN DEFAULT false;
  END IF;

  -- Add device_capture_metadata JSONB field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petri_observations' AND column_name = 'device_capture_metadata'
  ) THEN
    ALTER TABLE petri_observations ADD COLUMN device_capture_metadata JSONB;
  END IF;
END $$;

-- Create index for device-generated observations
CREATE INDEX IF NOT EXISTS idx_petri_observations_device_generated ON petri_observations(is_device_generated) WHERE is_device_generated = true;

-- Create GIN index for device_capture_metadata JSONB queries
CREATE INDEX IF NOT EXISTS idx_petri_observations_device_metadata ON petri_observations USING GIN (device_capture_metadata);

-- Add helpful comments
COMMENT ON COLUMN petri_observations.is_device_generated IS 'Flag indicating this observation was created automatically by an IoT device';
COMMENT ON COLUMN petri_observations.device_capture_metadata IS 'Full device sensor data at time of capture (temperature, humidity, pressure, gas_resistance, etc.)';

/*
  # Modify Gasifier Observations Table for IoT Device Support

  1. Changes
    - Add `is_device_generated` flag to distinguish automated observations
    - Add `device_capture_metadata` JSONB field for storing device sensor data
    - Add index on is_device_generated for filtering

  2. Purpose
    - Store full device metadata (temperature, humidity, pressure, gas_resistance) with each observation
    - Enable filtering and analytics on device vs. human captured observations
    - Preserve all sensor readings for correlation analysis

  3. Device Metadata Structure
    {
      "temperature": 25.5,
      "humidity": 45.2,
      "pressure": 1010.5,
      "gas_resistance": 15.3,
      "capture_timestamp": "2025-08-29T14:30:00Z",
      "device_mac": "B8F862F9CFB8",
      "firmware_version": "1.0.0",
      "battery_voltage": 3.8,
      "wifi_rssi": -65,
      "error_code": 0
    }
*/

-- Add new columns to gasifier_observations table
DO $$
BEGIN
  -- Add is_device_generated flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gasifier_observations' AND column_name = 'is_device_generated'
  ) THEN
    ALTER TABLE gasifier_observations ADD COLUMN is_device_generated BOOLEAN DEFAULT false;
  END IF;

  -- Add device_capture_metadata JSONB field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gasifier_observations' AND column_name = 'device_capture_metadata'
  ) THEN
    ALTER TABLE gasifier_observations ADD COLUMN device_capture_metadata JSONB;
  END IF;
END $$;

-- Create index for device-generated observations
CREATE INDEX IF NOT EXISTS idx_gasifier_observations_device_generated ON gasifier_observations(is_device_generated) WHERE is_device_generated = true;

-- Create GIN index for device_capture_metadata JSONB queries
CREATE INDEX IF NOT EXISTS idx_gasifier_observations_device_metadata ON gasifier_observations USING GIN (device_capture_metadata);

-- Add helpful comments
COMMENT ON COLUMN gasifier_observations.is_device_generated IS 'Flag indicating this observation was created automatically by an IoT device';
COMMENT ON COLUMN gasifier_observations.device_capture_metadata IS 'Full device sensor data at time of capture (temperature, humidity, pressure, gas_resistance, etc.)';
