/*
  # Device History & Wake Session Tracking System

  ## Overview
  This migration creates a comprehensive audit trail and session tracking system for IoT devices,
  enabling detailed monitoring of device activities, environmental readings, and operational events.

  ## New Tables

  1. **device_wake_sessions** - Tracks each device wake cycle
     - session_id (uuid, primary key)
     - device_id, site_id, program_id (foreign keys)
     - wake_timestamp, connection_success, image_captured
     - chunks_sent, chunks_total
     - telemetry_data (jsonb) - temperature, humidity, pressure, gas_resistance, battery_voltage, wifi_rssi
     - next_wake_scheduled, session_duration_ms
     - status (success/partial/failed)
     - error_codes (text array)
     - pending_images_count
     - created_at, updated_at

  2. **device_history** - Comprehensive audit trail for all device events
     - history_id (uuid, primary key)
     - device_id, site_id, program_id (foreign keys with null allowed for device-only events)
     - session_id (optional link to wake session)
     - event_category (enum) - WakeSession, ImageCapture, EnvironmentalReading, etc.
     - event_type (text) - specific event subtype
     - severity (enum) - info, warning, error, critical
     - event_timestamp
     - event_data (jsonb) - flexible storage for event-specific details
     - metadata (jsonb) - device state snapshot at event time
     - user_id (for manual actions)
     - created_at

  3. **device_error_codes** - Lookup table for firmware error codes
     - error_code (integer, primary key)
     - error_category (text)
     - error_message (text)
     - severity (enum)
     - recommended_action (text)

  ## Security
  - Enable RLS on all tables
  - Policies match existing device/site/program access patterns
  - Multi-tenant data isolation maintained

  ## Indexing Strategy
  - Primary access patterns: by device_id + date range, by site/program + date range
  - Category and severity filters
  - Session lookups
  - Export queries (full filtered result sets)
*/

-- ============================================
-- STEP 1: Create Enums
-- ============================================

-- Event category enum
DO $$ BEGIN
  CREATE TYPE device_event_category AS ENUM (
    'WakeSession',
    'ImageCapture',
    'EnvironmentalReading',
    'BatteryStatus',
    'Assignment',
    'Unassignment',
    'Activation',
    'Deactivation',
    'ChunkTransmission',
    'OfflineCapture',
    'WiFiConnectivity',
    'MQTTStatus',
    'ProvisioningStep',
    'FirmwareUpdate',
    'ConfigurationChange',
    'MaintenanceActivity',
    'ErrorEvent'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Event severity enum
DO $$ BEGIN
  CREATE TYPE event_severity AS ENUM (
    'info',
    'warning',
    'error',
    'critical'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Session status enum
DO $$ BEGIN
  CREATE TYPE device_session_status AS ENUM (
    'success',
    'partial',
    'failed',
    'in_progress'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- STEP 2: Create Device Wake Sessions Table
-- ============================================

CREATE TABLE IF NOT EXISTS device_wake_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(site_id) ON DELETE SET NULL,
  program_id UUID REFERENCES pilot_programs(program_id) ON DELETE SET NULL,

  -- Wake cycle timing
  wake_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_duration_ms INTEGER,
  next_wake_scheduled TIMESTAMPTZ,

  -- Connection status
  connection_success BOOLEAN DEFAULT false,
  wifi_retry_count INTEGER DEFAULT 0,
  mqtt_connected BOOLEAN DEFAULT false,

  -- Image capture
  image_captured BOOLEAN DEFAULT false,
  image_id UUID REFERENCES device_images(image_id) ON DELETE SET NULL,

  -- Chunk transmission
  chunks_sent INTEGER DEFAULT 0,
  chunks_total INTEGER DEFAULT 0,
  chunks_missing INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  transmission_complete BOOLEAN DEFAULT false,

  -- Telemetry data (nested battery data here)
  telemetry_data JSONB DEFAULT '{}'::jsonb,
  -- Expected structure: { temperature, humidity, pressure, gas_resistance, battery_voltage, battery_health_percent, wifi_rssi }

  -- Session outcome
  status device_session_status DEFAULT 'in_progress',
  error_codes TEXT[] DEFAULT ARRAY[]::TEXT[],
  pending_images_count INTEGER DEFAULT 0,

  -- Offline operation tracking
  was_offline_capture BOOLEAN DEFAULT false,
  offline_duration_hours NUMERIC(10,2),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- STEP 3: Create Device History Table
-- ============================================

CREATE TABLE IF NOT EXISTS device_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(site_id) ON DELETE SET NULL,
  program_id UUID REFERENCES pilot_programs(program_id) ON DELETE SET NULL,
  session_id UUID REFERENCES device_wake_sessions(session_id) ON DELETE SET NULL,

  -- Event classification
  event_category device_event_category NOT NULL,
  event_type TEXT NOT NULL,
  severity event_severity NOT NULL DEFAULT 'info',

  -- Event details
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_data JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- User tracking (for manual actions)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Searchable description
  description TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- STEP 4: Create Device Error Codes Table
-- ============================================

CREATE TABLE IF NOT EXISTS device_error_codes (
  error_code INTEGER PRIMARY KEY,
  error_category TEXT NOT NULL,
  error_message TEXT NOT NULL,
  severity event_severity NOT NULL DEFAULT 'error',
  recommended_action TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- STEP 5: Create Indexes for Performance
-- ============================================

-- Device Wake Sessions Indexes
CREATE INDEX IF NOT EXISTS idx_device_wake_sessions_device_id ON device_wake_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_device_wake_sessions_site_id ON device_wake_sessions(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_wake_sessions_program_id ON device_wake_sessions(program_id) WHERE program_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_wake_sessions_wake_timestamp ON device_wake_sessions(wake_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_device_wake_sessions_status ON device_wake_sessions(status);
CREATE INDEX IF NOT EXISTS idx_device_wake_sessions_device_timestamp ON device_wake_sessions(device_id, wake_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_device_wake_sessions_site_timestamp ON device_wake_sessions(site_id, wake_timestamp DESC) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_wake_sessions_program_timestamp ON device_wake_sessions(program_id, wake_timestamp DESC) WHERE program_id IS NOT NULL;

-- Device History Indexes
CREATE INDEX IF NOT EXISTS idx_device_history_device_id ON device_history(device_id);
CREATE INDEX IF NOT EXISTS idx_device_history_site_id ON device_history(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_history_program_id ON device_history(program_id) WHERE program_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_history_session_id ON device_history(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_history_event_timestamp ON device_history(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_device_history_event_category ON device_history(event_category);
CREATE INDEX IF NOT EXISTS idx_device_history_severity ON device_history(severity);
CREATE INDEX IF NOT EXISTS idx_device_history_user_id ON device_history(user_id) WHERE user_id IS NOT NULL;

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_device_history_device_timestamp ON device_history(device_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_device_history_site_timestamp ON device_history(site_id, event_timestamp DESC) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_history_program_timestamp ON device_history(program_id, event_timestamp DESC) WHERE program_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_history_device_category ON device_history(device_id, event_category);
CREATE INDEX IF NOT EXISTS idx_device_history_device_severity ON device_history(device_id, severity) WHERE severity IN ('error', 'critical');
CREATE INDEX IF NOT EXISTS idx_device_history_category_timestamp ON device_history(event_category, event_timestamp DESC);

-- GIN index for JSONB search
CREATE INDEX IF NOT EXISTS idx_device_history_event_data_gin ON device_history USING gin(event_data);
CREATE INDEX IF NOT EXISTS idx_device_history_metadata_gin ON device_history USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_device_wake_sessions_telemetry_gin ON device_wake_sessions USING gin(telemetry_data);

-- ============================================
-- STEP 6: Add Table Comments
-- ============================================

COMMENT ON TABLE device_wake_sessions IS 'Tracks each device wake cycle with comprehensive session details including telemetry, image capture, and transmission status';
COMMENT ON TABLE device_history IS 'Comprehensive audit trail for all device events, activities, and state changes';
COMMENT ON TABLE device_error_codes IS 'Lookup table mapping firmware error codes to categories, severity levels, and recommended actions';

COMMENT ON COLUMN device_wake_sessions.telemetry_data IS 'JSONB containing sensor readings: temperature, humidity, pressure, gas_resistance, battery_voltage, battery_health_percent, wifi_rssi';
COMMENT ON COLUMN device_history.event_data IS 'JSONB containing event-specific details: error codes, battery levels, transmission stats, configuration changes, etc.';
COMMENT ON COLUMN device_history.metadata IS 'JSONB snapshot of device state at time of event: firmware_version, hardware_version, provisioning_status, active assignments';
COMMENT ON COLUMN device_history.description IS 'Human-readable event description for display in UI and exports';

-- ============================================
-- STEP 7: Create Updated At Trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_device_wake_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_device_wake_sessions_updated_at
  BEFORE UPDATE ON device_wake_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_device_wake_sessions_updated_at();

-- ============================================
-- STEP 8: Enable Row Level Security
-- ============================================

ALTER TABLE device_wake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_error_codes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 9: Create RLS Policies
-- ============================================

-- Device Wake Sessions Policies
-- Users can view sessions for devices they have access to via program membership

CREATE POLICY "Users can view device sessions for their programs"
  ON device_wake_sessions FOR SELECT
  TO authenticated
  USING (
    program_id IN (
      SELECT program_id FROM program_users WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND is_company_admin = true
      AND company_id = (SELECT company_id FROM pilot_programs WHERE program_id = device_wake_sessions.program_id)
    )
  );

CREATE POLICY "System can insert device sessions"
  ON device_wake_sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update device sessions"
  ON device_wake_sessions FOR UPDATE
  TO authenticated
  USING (true);

-- Device History Policies
-- Users can view history for devices in their programs

CREATE POLICY "Users can view device history for their programs"
  ON device_history FOR SELECT
  TO authenticated
  USING (
    program_id IN (
      SELECT program_id FROM program_users WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND is_company_admin = true
      AND company_id = (SELECT company_id FROM pilot_programs WHERE program_id = device_history.program_id)
    )
    OR
    device_id IN (
      SELECT device_id FROM devices WHERE program_id IN (
        SELECT program_id FROM program_users WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "System can insert device history"
  ON device_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Device Error Codes Policies (read-only lookup table)

CREATE POLICY "Everyone can view error codes"
  ON device_error_codes FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- STEP 10: Populate Device Error Codes
-- ============================================

-- Insert common error codes based on firmware documentation
INSERT INTO device_error_codes (error_code, error_category, error_message, severity, recommended_action) VALUES
  (0, 'Success', 'Operation completed successfully', 'info', 'No action required'),
  (1, 'WiFiConnection', 'WiFi connection failed after retries', 'error', 'Check WiFi credentials and network availability'),
  (2, 'MQTTConnection', 'MQTT broker connection failed', 'error', 'Verify MQTT broker status and credentials'),
  (3, 'SensorFailure', 'BME680 sensor read failure', 'error', 'Check sensor connections and power'),
  (4, 'ImageCapture', 'Camera capture failed', 'error', 'Verify camera module connection and initialization'),
  (5, 'ChunkTransmission', 'Image chunk transmission failed', 'warning', 'Check network stability and retry'),
  (6, 'SDCard', 'SD card read/write error', 'critical', 'Check SD card insertion and format'),
  (7, 'BatteryLow', 'Battery voltage below warning threshold', 'warning', 'Charge or replace battery soon'),
  (8, 'BatteryCritical', 'Battery voltage critically low', 'critical', 'Replace battery immediately'),
  (9, 'Timeout', 'Operation timeout exceeded', 'error', 'Check network connectivity and retry'),
  (10, 'MissedWake', 'Device missed scheduled wake window', 'warning', 'Check device power and wake schedule'),
  (11, 'MissedMultipleWakes', 'Device missed multiple consecutive wake windows', 'error', 'Device may be offline or experiencing power issues'),
  (12, 'OfflineCapture', 'Image captured during offline period', 'info', 'Will sync when connection restored'),
  (13, 'ChunkRetry', 'Retransmitting missing chunks', 'info', 'Normal retry operation in progress'),
  (14, 'ConfigurationError', 'Device configuration invalid or missing', 'error', 'Reconfigure device via BLE or web interface'),
  (15, 'FirmwareUpdateFailed', 'Firmware update failed', 'error', 'Retry firmware update or restore previous version')
ON CONFLICT (error_code) DO NOTHING;

-- ============================================
-- STEP 11: Grant Permissions
-- ============================================

GRANT SELECT, INSERT, UPDATE ON device_wake_sessions TO authenticated;
GRANT SELECT, INSERT ON device_history TO authenticated;
GRANT SELECT ON device_error_codes TO authenticated;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
