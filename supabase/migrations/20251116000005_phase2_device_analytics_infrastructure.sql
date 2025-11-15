/*
  # Phase 2: Device Analytics Infrastructure

  1. Program/Site Scoping
    - Add program_id, site_id, site_device_session_id to all payload tables for proper analytics framing
    - Ensures all device data can be queried within program context

  2. Wake Variance Tracking
    - Track when device wakes early/late vs expected
    - Helps identify device health issues and timing reliability

  3. Device Rollup Statistics
    - Add aggregate counters to devices table for quick dashboard views
    - Track total wakes, alerts, images, etc. to detect anomalies

  4. MGI Scoring Infrastructure
    - Add columns for Mold Growth Index and derivatives
    - Support future Roboflow integration (Phase 3)

  5. Program Expiry Automation
    - Support automated device reassignment when programs end
    - Track alert status for unassigned devices

  6. Enable pg_cron for Daily Session Creation
    - Automate daily site_device_session creation at midnight
*/

-- ==========================================
-- 1. ADD PROGRAM/SITE SCOPING TO PAYLOAD TABLES
-- ==========================================

-- device_telemetry: Add program/site context
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_telemetry' AND column_name = 'program_id'
  ) THEN
    ALTER TABLE device_telemetry ADD COLUMN program_id UUID REFERENCES pilot_programs(program_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_telemetry' AND column_name = 'site_id'
  ) THEN
    ALTER TABLE device_telemetry ADD COLUMN site_id UUID REFERENCES sites(site_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_telemetry' AND column_name = 'site_device_session_id'
  ) THEN
    ALTER TABLE device_telemetry ADD COLUMN site_device_session_id UUID REFERENCES site_device_sessions(session_id);
  END IF;
END $$;

-- device_images: Add program/site context + MGI scoring
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'program_id'
  ) THEN
    ALTER TABLE device_images ADD COLUMN program_id UUID REFERENCES pilot_programs(program_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'site_id'
  ) THEN
    ALTER TABLE device_images ADD COLUMN site_id UUID REFERENCES sites(site_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'site_device_session_id'
  ) THEN
    ALTER TABLE device_images ADD COLUMN site_device_session_id UUID REFERENCES site_device_sessions(session_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'mgi_score'
  ) THEN
    ALTER TABLE device_images ADD COLUMN mgi_score NUMERIC CHECK (mgi_score >= 0 AND mgi_score <= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'mold_growth_velocity'
  ) THEN
    ALTER TABLE device_images ADD COLUMN mold_growth_velocity NUMERIC;
    COMMENT ON COLUMN device_images.mold_growth_velocity IS 'MGI change relative to prior image for this device';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'mold_growth_speed'
  ) THEN
    ALTER TABLE device_images ADD COLUMN mold_growth_speed NUMERIC;
    COMMENT ON COLUMN device_images.mold_growth_speed IS 'MGI velocity normalized per day';
  END IF;
END $$;

-- device_commands: Add program/site context
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_commands' AND column_name = 'program_id'
  ) THEN
    ALTER TABLE device_commands ADD COLUMN program_id UUID REFERENCES pilot_programs(program_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_commands' AND column_name = 'site_id'
  ) THEN
    ALTER TABLE device_commands ADD COLUMN site_id UUID REFERENCES sites(site_id);
  END IF;
END $$;

-- device_ack_log: Add program/site context
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_ack_log' AND column_name = 'program_id'
  ) THEN
    ALTER TABLE device_ack_log ADD COLUMN program_id UUID REFERENCES pilot_programs(program_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_ack_log' AND column_name = 'site_id'
  ) THEN
    ALTER TABLE device_ack_log ADD COLUMN site_id UUID REFERENCES sites(site_id);
  END IF;
END $$;

-- device_alerts: Add program/site context
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_alerts' AND column_name = 'program_id'
  ) THEN
    ALTER TABLE device_alerts ADD COLUMN program_id UUID REFERENCES pilot_programs(program_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_alerts' AND column_name = 'site_id'
  ) THEN
    ALTER TABLE device_alerts ADD COLUMN site_id UUID REFERENCES sites(site_id);
  END IF;
END $$;

-- ==========================================
-- 2. ADD WAKE VARIANCE TRACKING
-- ==========================================

-- device_wake_sessions: Track variance for each wake
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_wake_sessions' AND column_name = 'wake_variance_minutes'
  ) THEN
    ALTER TABLE device_wake_sessions ADD COLUMN wake_variance_minutes INTEGER;
    COMMENT ON COLUMN device_wake_sessions.wake_variance_minutes IS 'Actual wake time minus expected wake time in minutes. Negative = early, Positive = late';
  END IF;
END $$;

-- devices: Store latest wake variance
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'last_wake_variance_minutes'
  ) THEN
    ALTER TABLE devices ADD COLUMN last_wake_variance_minutes INTEGER;
    COMMENT ON COLUMN devices.last_wake_variance_minutes IS 'Most recent wake variance. Helps identify timing drift trends';
  END IF;
END $$;

-- ==========================================
-- 3. ADD DEVICE ROLLUP STATISTICS
-- ==========================================

DO $$
BEGIN
  -- Total wakes counter
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'total_wakes'
  ) THEN
    ALTER TABLE devices ADD COLUMN total_wakes INTEGER DEFAULT 0;
    COMMENT ON COLUMN devices.total_wakes IS 'Lifetime wake count for this device';
  END IF;

  -- Total alerts counter
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'total_alerts'
  ) THEN
    ALTER TABLE devices ADD COLUMN total_alerts INTEGER DEFAULT 0;
    COMMENT ON COLUMN devices.total_alerts IS 'Lifetime alert count for this device';
  END IF;

  -- Battery health alerts
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'total_battery_health_alerts'
  ) THEN
    ALTER TABLE devices ADD COLUMN total_battery_health_alerts INTEGER DEFAULT 0;
    COMMENT ON COLUMN devices.total_battery_health_alerts IS 'Count of low battery alerts';
  END IF;

  -- Images taken
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'total_images_taken'
  ) THEN
    ALTER TABLE devices ADD COLUMN total_images_taken INTEGER DEFAULT 0;
    COMMENT ON COLUMN devices.total_images_taken IS 'Total images successfully captured';
  END IF;

  -- Images expected to date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'total_images_expected_to_date'
  ) THEN
    ALTER TABLE devices ADD COLUMN total_images_expected_to_date INTEGER DEFAULT 0;
    COMMENT ON COLUMN devices.total_images_expected_to_date IS 'Expected image count based on wake schedule. Used to detect broken devices';
  END IF;
END $$;

-- ==========================================
-- 4. ADD PROGRAM EXPIRY AUTOMATION SUPPORT
-- ==========================================

DO $$
BEGIN
  -- Next program assignment (for automated reassignment)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'next_program_id'
  ) THEN
    ALTER TABLE devices ADD COLUMN next_program_id UUID REFERENCES pilot_programs(program_id);
    COMMENT ON COLUMN devices.next_program_id IS 'Pre-configured next program for automated reassignment when current program ends';
  END IF;

  -- Next site assignment
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'next_site_id'
  ) THEN
    ALTER TABLE devices ADD COLUMN next_site_id UUID REFERENCES sites(site_id);
    COMMENT ON COLUMN devices.next_site_id IS 'Pre-configured next site for automated reassignment';
  END IF;

  -- Track if expiry alert has been sent
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'program_expiry_alert_sent'
  ) THEN
    ALTER TABLE devices ADD COLUMN program_expiry_alert_sent BOOLEAN DEFAULT FALSE;
    COMMENT ON COLUMN devices.program_expiry_alert_sent IS 'Track if admin has been alerted about program expiration for this device';
  END IF;

  -- Track if device is in "overtime" mode (program ended but still collecting data)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'is_overtime_mode'
  ) THEN
    ALTER TABLE devices ADD COLUMN is_overtime_mode BOOLEAN DEFAULT FALSE;
    COMMENT ON COLUMN devices.is_overtime_mode IS 'TRUE when device program expired but device still collecting data awaiting reassignment';
  END IF;
END $$;

-- ==========================================
-- 5. ENABLE PG_CRON FOR DAILY SESSION CREATION
-- ==========================================

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily session creation at midnight UTC
-- This runs the function that creates site_device_sessions for all active sites
SELECT cron.schedule(
  'auto-create-device-sessions-daily',
  '0 0 * * *',  -- Midnight UTC every day
  $$ SELECT auto_create_daily_sessions(); $$
);

COMMENT ON EXTENSION pg_cron IS 'Enables scheduled job execution. Used to create daily site_device_sessions at midnight.';

-- ==========================================
-- 6. CREATE INDEXES FOR ANALYTICS QUERIES
-- ==========================================

-- Index for program-scoped telemetry queries
CREATE INDEX IF NOT EXISTS idx_device_telemetry_program_date
  ON device_telemetry(program_id, captured_at DESC);

-- Index for program-scoped image queries
CREATE INDEX IF NOT EXISTS idx_device_images_program_date
  ON device_images(program_id, captured_at DESC);

-- Index for site_device_session lookups
CREATE INDEX IF NOT EXISTS idx_device_telemetry_session
  ON device_telemetry(site_device_session_id);

CREATE INDEX IF NOT EXISTS idx_device_images_session
  ON device_images(site_device_session_id);

-- Index for wake variance analysis
CREATE INDEX IF NOT EXISTS idx_device_wake_sessions_variance
  ON device_wake_sessions(device_id, wake_timestamp DESC)
  WHERE wake_variance_minutes IS NOT NULL;

-- Index for devices in overtime mode
CREATE INDEX IF NOT EXISTS idx_devices_overtime
  ON devices(is_overtime_mode)
  WHERE is_overtime_mode = TRUE;

-- ==========================================
-- 7. CREATE HELPER VIEW FOR DEVICE ANALYTICS
-- ==========================================

CREATE OR REPLACE VIEW vw_device_analytics_summary AS
SELECT
  d.device_id,
  d.device_mac,
  d.device_name,
  d.site_id,
  d.program_id,
  d.company_id,
  d.is_active,
  d.provisioning_status,
  d.is_overtime_mode,

  -- Wake statistics
  d.total_wakes,
  d.last_wake_at,
  d.next_wake_at,
  d.last_wake_variance_minutes,

  -- Image statistics
  d.total_images_taken,
  d.total_images_expected_to_date,
  (d.total_images_expected_to_date - d.total_images_taken) as images_missing,
  CASE
    WHEN d.total_images_expected_to_date > 0
    THEN ROUND((d.total_images_taken::numeric / d.total_images_expected_to_date::numeric * 100), 2)
    ELSE 0
  END as image_success_rate_percent,

  -- Alert statistics
  d.total_alerts,
  d.total_battery_health_alerts,

  -- Battery and connectivity
  d.battery_voltage,
  d.battery_health_percent,
  d.wifi_rssi,

  -- Program context
  pp.name as program_name,
  pp.status as program_status,
  pp.start_date as program_start,
  pp.end_date as program_end,

  -- Site context
  s.name as site_name,
  s.site_code,

  -- Zone/placement
  d.zone_id,
  d.zone_label,
  d.x_position,
  d.y_position,

  d.created_at,
  d.updated_at,
  d.last_seen_at
FROM devices d
LEFT JOIN pilot_programs pp ON d.program_id = pp.program_id
LEFT JOIN sites s ON d.site_id = s.site_id;

COMMENT ON VIEW vw_device_analytics_summary IS
'Comprehensive device analytics view with rollup statistics, program context, and calculated metrics. Use for device detail pages and dashboards.';

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Phase 2 Device Analytics Infrastructure migration complete';
  RAISE NOTICE '- Added program/site scoping to 5 payload tables';
  RAISE NOTICE '- Added wake variance tracking (2 columns)';
  RAISE NOTICE '- Added device rollup statistics (5 columns)';
  RAISE NOTICE '- Added MGI scoring infrastructure (3 columns)';
  RAISE NOTICE '- Added program expiry automation (4 columns)';
  RAISE NOTICE '- Enabled pg_cron for daily session creation';
  RAISE NOTICE '- Created 6 analytics indexes';
  RAISE NOTICE '- Created vw_device_analytics_summary view';
END $$;
