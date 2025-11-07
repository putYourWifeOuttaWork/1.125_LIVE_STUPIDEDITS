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
