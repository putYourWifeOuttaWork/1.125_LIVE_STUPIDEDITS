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
    FROM program_access
    WHERE user_id = auth.uid()
  )
  OR site_id IN (
    SELECT site_id
    FROM sites
    WHERE program_id IN (
      SELECT program_id
      FROM program_access
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
