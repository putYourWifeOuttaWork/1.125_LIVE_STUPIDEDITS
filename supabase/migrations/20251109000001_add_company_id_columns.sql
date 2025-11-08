/*
  # Add company_id Columns for Multi-Tenancy

  1. Purpose
    - Add company_id to tables that are missing it for complete multi-tenancy support
    - Establish foreign key relationships to companies table
    - Create indexes for query performance

  2. Tables Updated
    - petri_observations: Add company_id (derive from program)
    - devices: Add company_id (maintain alongside junction assignments)
    - device_telemetry: Add company_id
    - device_images: Add company_id
    - device_commands: Add company_id
    - device_alerts: Add company_id
    - device_wake_sessions: Add company_id
    - device_history: Add company_id
    - submission_sessions: Add company_id
    - site_snapshots: Already has company_id
    - pilot_program_history: Add company_id

  3. Notes
    - All company_id columns are nullable initially (will be populated in next migration)
    - Foreign keys are added but not enforced until after backfill
    - Indexes are created for query performance
*/

-- ==========================================
-- PETRI OBSERVATIONS
-- ==========================================

-- Add company_id to petri_observations (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petri_observations'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE petri_observations
    ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_petri_observations_company_id
    ON petri_observations(company_id);
  END IF;
END $$;

-- ==========================================
-- DEVICES
-- ==========================================

-- Add company_id to devices (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE devices
    ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_devices_company_id
    ON devices(company_id);
  END IF;
END $$;

-- ==========================================
-- DEVICE TELEMETRY
-- ==========================================

-- Add company_id to device_telemetry (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_telemetry'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE device_telemetry
    ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_device_telemetry_company_id
    ON device_telemetry(company_id);
  END IF;
END $$;

-- ==========================================
-- DEVICE IMAGES
-- ==========================================

-- Add company_id to device_images (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE device_images
    ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_device_images_company_id
    ON device_images(company_id);
  END IF;
END $$;

-- ==========================================
-- DEVICE COMMANDS
-- ==========================================

-- Add company_id to device_commands (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_commands'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE device_commands
    ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_device_commands_company_id
    ON device_commands(company_id);
  END IF;
END $$;

-- ==========================================
-- DEVICE ALERTS
-- ==========================================

-- Add company_id to device_alerts (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_alerts'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE device_alerts
    ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_device_alerts_company_id
    ON device_alerts(company_id);
  END IF;
END $$;

-- ==========================================
-- DEVICE WAKE SESSIONS
-- ==========================================

-- Add company_id to device_wake_sessions (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_wake_sessions'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE device_wake_sessions
    ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_device_wake_sessions_company_id
    ON device_wake_sessions(company_id);
  END IF;
END $$;

-- ==========================================
-- DEVICE HISTORY
-- ==========================================

-- Add company_id to device_history (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_history'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE device_history
    ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_device_history_company_id
    ON device_history(company_id);
  END IF;
END $$;

-- ==========================================
-- SUBMISSION SESSIONS
-- ==========================================

-- Add company_id to submission_sessions (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submission_sessions'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE submission_sessions
    ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_submission_sessions_company_id
    ON submission_sessions(company_id);
  END IF;
END $$;

-- ==========================================
-- PILOT PROGRAM HISTORY
-- ==========================================

-- Add company_id to pilot_program_history (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilot_program_history'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE pilot_program_history
    ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_pilot_program_history_company_id
    ON pilot_program_history(company_id);
  END IF;
END $$;

-- ==========================================
-- PILOT PROGRAM HISTORY STAGING
-- ==========================================

-- Add company_id to pilot_program_history_staging (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilot_program_history_staging'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE pilot_program_history_staging
    ADD COLUMN company_id UUID;
  END IF;
END $$;

-- ==========================================
-- JUNCTION TABLES - Add company_id for analytics
-- ==========================================

-- Add company_id to device_site_assignments (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_site_assignments'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE device_site_assignments
    ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_device_site_assignments_company_id
    ON device_site_assignments(company_id);
  END IF;
END $$;

-- Add company_id to device_program_assignments (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_program_assignments'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE device_program_assignments
    ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_device_program_assignments_company_id
    ON device_program_assignments(company_id);
  END IF;
END $$;

-- Add company_id to site_program_assignments (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_program_assignments'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE site_program_assignments
    ADD COLUMN company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE;

    -- Create index for performance
    CREATE INDEX IF NOT EXISTS idx_site_program_assignments_company_id
    ON site_program_assignments(company_id);
  END IF;
END $$;

-- Add helpful comments
COMMENT ON COLUMN petri_observations.company_id IS 'Company that owns this observation (derived from program)';
COMMENT ON COLUMN devices.company_id IS 'Company that owns this device (derived from current program assignment)';
COMMENT ON COLUMN device_telemetry.company_id IS 'Company that owns the device (for analytics and filtering)';
COMMENT ON COLUMN device_images.company_id IS 'Company that owns the device (for analytics and filtering)';
COMMENT ON COLUMN device_commands.company_id IS 'Company that owns the device (for analytics and filtering)';
COMMENT ON COLUMN device_alerts.company_id IS 'Company that owns the device (for analytics and filtering)';
COMMENT ON COLUMN device_wake_sessions.company_id IS 'Company that owns the device (for analytics and filtering)';
COMMENT ON COLUMN device_history.company_id IS 'Company that owns the device (for analytics and filtering)';
COMMENT ON COLUMN submission_sessions.company_id IS 'Company that owns this submission session';
COMMENT ON COLUMN pilot_program_history.company_id IS 'Company associated with this audit event';
