/*
  # Device-Generated Submissions System

  1. Purpose
    - Enable automated device submissions with site fleet sessions
    - Track device wakes as atomic data units with full lineage
    - Support dynamic per-device wake schedules with midnight-effective changes
    - Maintain complete audit trail for retry-by-ID logic

  2. New Tables
    - `site_device_sessions` - Daily time-bounded container for site fleet wakes
    - `device_wake_payloads` - Canonical per-wake event with telemetry snapshot
    - `device_schedule_changes` - Queue for midnight-effective schedule changes

  3. Table Extensions
    - `devices` - Add x_position, y_position for spatial analytics
    - `device_images` - Add resent_received_at, original_capture_date for retry audit

  4. Key Principles
    - Sessions are time-based (midnight to midnight), never "incomplete"
    - One device = one image per wake window
    - Retry updates same row (never duplicate)
    - Full lineage: company → program → site → session → device → payload
    - RLS filtered by get_active_company_id()

  5. Security
    - All tables have RLS enabled
    - Company-scoped access using existing context system
    - Admins-only write access to schedule changes
*/

-- ==========================================
-- TABLE 1: SITE_DEVICE_SESSIONS
-- ==========================================

CREATE TABLE IF NOT EXISTS site_device_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lineage
  company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES pilot_programs(program_id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,

  -- Time boundary (site timezone)
  session_date DATE NOT NULL,
  session_start_time TIMESTAMPTZ NOT NULL,
  session_end_time TIMESTAMPTZ NOT NULL,

  -- Expectations (locked at midnight)
  expected_wake_count INT NOT NULL DEFAULT 0,

  -- Actuals (increment as data arrives)
  completed_wake_count INT DEFAULT 0,
  failed_wake_count INT DEFAULT 0,
  extra_wake_count INT DEFAULT 0,

  -- Status
  status TEXT CHECK (status IN ('pending', 'in_progress', 'locked')) DEFAULT 'pending',

  -- Flags
  config_changed_flag BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  locked_at TIMESTAMPTZ,

  -- Ensure one session per site per day
  UNIQUE(site_id, session_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_site_device_sessions_company ON site_device_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_site_device_sessions_program ON site_device_sessions(program_id);
CREATE INDEX IF NOT EXISTS idx_site_device_sessions_site ON site_device_sessions(site_id);
CREATE INDEX IF NOT EXISTS idx_site_device_sessions_date ON site_device_sessions(session_date DESC);
CREATE INDEX IF NOT EXISTS idx_site_device_sessions_status ON site_device_sessions(status);
CREATE INDEX IF NOT EXISTS idx_site_device_sessions_site_date ON site_device_sessions(site_id, session_date DESC);

-- RLS
ALTER TABLE site_device_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see site sessions in their company" ON site_device_sessions;
CREATE POLICY "Users see site sessions in their company"
  ON site_device_sessions FOR SELECT TO authenticated
  USING (company_id = get_active_company_id());

-- Comments
COMMENT ON TABLE site_device_sessions IS 'Daily time-bounded container for all device wakes at a site. Never incomplete - always time-based (midnight to midnight).';
COMMENT ON COLUMN site_device_sessions.expected_wake_count IS 'Sum of expected wakes across all active devices for this day (locked at midnight)';
COMMENT ON COLUMN site_device_sessions.completed_wake_count IS 'Number of successfully received device wakes';
COMMENT ON COLUMN site_device_sessions.failed_wake_count IS 'Number of failed device wakes';
COMMENT ON COLUMN site_device_sessions.extra_wake_count IS 'Number of unexpected wakes (overage accepted but tracked)';
COMMENT ON COLUMN site_device_sessions.config_changed_flag IS 'TRUE if device settings changed mid-day (audit flag)';

-- ==========================================
-- TABLE 2: DEVICE_WAKE_PAYLOADS
-- ==========================================

CREATE TABLE IF NOT EXISTS device_wake_payloads (
  payload_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Full lineage (for analytics)
  company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES pilot_programs(program_id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  site_device_session_id UUID NOT NULL REFERENCES site_device_sessions(session_id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,

  -- Timing
  captured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ,
  wake_window_index INT,

  -- Image linkage (same row reused on retries)
  image_id UUID REFERENCES device_images(image_id) ON DELETE SET NULL,
  image_status TEXT CHECK (image_status IN ('pending', 'receiving', 'complete', 'failed')),
  resent_received_at TIMESTAMPTZ,

  -- Telemetry snapshot (denormalized for fast reads)
  temperature NUMERIC(5,2),
  humidity NUMERIC(5,2),
  pressure NUMERIC(7,2),
  gas_resistance NUMERIC(10,2),
  battery_voltage NUMERIC(4,2),
  wifi_rssi INT,

  -- Full backup
  telemetry_data JSONB,

  -- State
  payload_status TEXT CHECK (payload_status IN ('pending', 'complete', 'failed')) DEFAULT 'pending',
  overage_flag BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_wake_payloads_company ON device_wake_payloads(company_id);
CREATE INDEX IF NOT EXISTS idx_device_wake_payloads_program ON device_wake_payloads(program_id);
CREATE INDEX IF NOT EXISTS idx_device_wake_payloads_site ON device_wake_payloads(site_id);
CREATE INDEX IF NOT EXISTS idx_device_wake_payloads_session ON device_wake_payloads(site_device_session_id);
CREATE INDEX IF NOT EXISTS idx_device_wake_payloads_device ON device_wake_payloads(device_id);
CREATE INDEX IF NOT EXISTS idx_device_wake_payloads_captured ON device_wake_payloads(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_wake_payloads_status ON device_wake_payloads(payload_status);
CREATE INDEX IF NOT EXISTS idx_device_wake_payloads_image ON device_wake_payloads(image_id) WHERE image_id IS NOT NULL;

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_device_wake_payloads_telemetry ON device_wake_payloads USING GIN (telemetry_data);

-- RLS
ALTER TABLE device_wake_payloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see payloads in their company" ON device_wake_payloads;
CREATE POLICY "Users see payloads in their company"
  ON device_wake_payloads FOR SELECT TO authenticated
  USING (company_id = get_active_company_id());

-- Comments
COMMENT ON TABLE device_wake_payloads IS 'Canonical per-wake event record. One row per device wake window. Supersedes device_wake_sessions as authoritative source.';
COMMENT ON COLUMN device_wake_payloads.wake_window_index IS 'Server-inferred ordinal (1st, 2nd, 3rd wake of day)';
COMMENT ON COLUMN device_wake_payloads.image_id IS 'Links to device_images. Same row reused on retries (never duplicate).';
COMMENT ON COLUMN device_wake_payloads.resent_received_at IS 'Timestamp when retried image was received (late fix audit trail)';
COMMENT ON COLUMN device_wake_payloads.telemetry_data IS 'Complete raw device metadata JSON for full audit trail';
COMMENT ON COLUMN device_wake_payloads.overage_flag IS 'TRUE if wake was not in expected schedule buckets';

-- ==========================================
-- TABLE 3: DEVICE_SCHEDULE_CHANGES
-- ==========================================

CREATE TABLE IF NOT EXISTS device_schedule_changes (
  change_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,

  -- Change details
  new_wake_schedule_cron TEXT NOT NULL,

  -- Audit trail
  requested_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  requested_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Effective timing
  effective_date DATE NOT NULL,
  applied_at TIMESTAMPTZ,
  applied_by_function TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_device_schedule_changes_device ON device_schedule_changes(device_id);
CREATE INDEX IF NOT EXISTS idx_device_schedule_changes_effective ON device_schedule_changes(effective_date);
CREATE INDEX IF NOT EXISTS idx_device_schedule_changes_applied ON device_schedule_changes(applied_at);
CREATE INDEX IF NOT EXISTS idx_device_schedule_changes_pending ON device_schedule_changes(effective_date, applied_at) WHERE applied_at IS NULL;

-- RLS
ALTER TABLE device_schedule_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see schedule changes in their company" ON device_schedule_changes;
CREATE POLICY "Users see schedule changes in their company"
  ON device_schedule_changes FOR SELECT TO authenticated
  USING (company_id = get_active_company_id());

DROP POLICY IF EXISTS "Admins manage schedule changes in their company" ON device_schedule_changes;
CREATE POLICY "Admins manage schedule changes in their company"
  ON device_schedule_changes FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_active_company_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND (is_company_admin = TRUE OR is_super_admin = TRUE)
    )
  );

DROP POLICY IF EXISTS "Admins update schedule changes in their company" ON device_schedule_changes;
CREATE POLICY "Admins update schedule changes in their company"
  ON device_schedule_changes FOR UPDATE TO authenticated
  USING (
    company_id = get_active_company_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND (is_company_admin = TRUE OR is_super_admin = TRUE)
    )
  );

-- Comments
COMMENT ON TABLE device_schedule_changes IS 'Queue for per-device wake schedule changes. Applied only at midnight session boundary to preserve data integrity.';
COMMENT ON COLUMN device_schedule_changes.new_wake_schedule_cron IS 'Cron expression for wake schedule (e.g., "0 8,16 * * *" or "0 */2 * * *")';
COMMENT ON COLUMN device_schedule_changes.effective_date IS 'Date when this change takes effect (at midnight)';
COMMENT ON COLUMN device_schedule_changes.applied_at IS 'NULL until applied by midnight cron job';
COMMENT ON COLUMN device_schedule_changes.applied_by_function IS 'Function identifier that applied the change';

-- ==========================================
-- EXTEND EXISTING TABLES
-- ==========================================

-- Add spatial coordinates to devices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'x_position'
  ) THEN
    ALTER TABLE devices ADD COLUMN x_position NUMERIC;
    COMMENT ON COLUMN devices.x_position IS 'Site X-coordinate for spatial analytics';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'y_position'
  ) THEN
    ALTER TABLE devices ADD COLUMN y_position NUMERIC;
    COMMENT ON COLUMN devices.y_position IS 'Site Y-coordinate for spatial analytics';
  END IF;
END $$;

-- Add retry audit fields to device_images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'resent_received_at'
  ) THEN
    ALTER TABLE device_images ADD COLUMN resent_received_at TIMESTAMPTZ;
    COMMENT ON COLUMN device_images.resent_received_at IS 'Timestamp when retried image was received (late fix audit trail)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'original_capture_date'
  ) THEN
    ALTER TABLE device_images ADD COLUMN original_capture_date DATE;
    COMMENT ON COLUMN device_images.original_capture_date IS 'Date of original capture (for fast session lookup)';
  END IF;
END $$;

-- Create index on original_capture_date for fast lookups
CREATE INDEX IF NOT EXISTS idx_device_images_original_capture_date ON device_images(original_capture_date);
