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
