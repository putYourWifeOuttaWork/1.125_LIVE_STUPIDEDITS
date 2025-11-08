/*
  # Backfill company_id Data for Multi-Tenancy

  1. Purpose
    - Populate company_id on all existing records
    - Create or identify "Sandhill Growers" as default company
    - Derive company_id from related records (program -> company)
    - Ensure data integrity across all tables

  2. Backfill Strategy
    - Create default company if it doesn't exist
    - Backfill pilot_programs.company_id (default to Sandhill Growers if null)
    - Backfill sites.company_id from program
    - Backfill submissions.company_id from program
    - Backfill observations.company_id from program
    - Backfill devices.company_id from program
    - Backfill all device-related tables from device
    - Backfill submission_sessions.company_id from program
    - Backfill junction tables from their relationships

  3. Data Integrity
    - All records will have a company_id after this migration
    - Foreign key relationships are maintained
    - Orphaned records are assigned to default company
*/

-- ==========================================
-- STEP 1: CREATE OR IDENTIFY DEFAULT COMPANY
-- ==========================================

DO $$
DECLARE
  v_default_company_id UUID;
BEGIN
  -- Try to find existing Sandhill Growers company
  SELECT company_id INTO v_default_company_id
  FROM companies
  WHERE name = 'Sandhill Growers'
  LIMIT 1;

  -- If not found, create it
  IF v_default_company_id IS NULL THEN
    INSERT INTO companies (name, description, created_at, updated_at)
    VALUES (
      'Sandhill Growers',
      'Default company for legacy data',
      now(),
      now()
    )
    RETURNING company_id INTO v_default_company_id;

    RAISE NOTICE 'Created default company: Sandhill Growers with ID: %', v_default_company_id;
  ELSE
    RAISE NOTICE 'Found existing default company: Sandhill Growers with ID: %', v_default_company_id;
  END IF;

  -- Store in a temporary table for use in subsequent operations
  CREATE TEMP TABLE IF NOT EXISTS temp_default_company AS
  SELECT v_default_company_id as company_id;
END $$;

-- ==========================================
-- STEP 2: BACKFILL PILOT_PROGRAMS
-- ==========================================

-- Update pilot_programs that don't have a company_id
UPDATE pilot_programs
SET company_id = (SELECT company_id FROM temp_default_company)
WHERE company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM pilot_programs
  WHERE company_id = (SELECT company_id FROM temp_default_company);

  RAISE NOTICE 'Backfilled % pilot_programs with default company_id', v_updated_count;
END $$;

-- ==========================================
-- STEP 3: BACKFILL SITES
-- ==========================================

-- Update sites.company_id from their associated program
UPDATE sites s
SET company_id = pp.company_id
FROM pilot_programs pp
WHERE s.program_id = pp.program_id
  AND s.company_id IS NULL;

-- Handle sites without a program (orphaned) - assign to default company
UPDATE sites
SET company_id = (SELECT company_id FROM temp_default_company)
WHERE company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM sites
  WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % sites', v_updated_count;
END $$;

-- ==========================================
-- STEP 4: BACKFILL SUBMISSIONS
-- ==========================================

-- Update submissions.company_id from their associated program
UPDATE submissions sub
SET company_id = pp.company_id
FROM pilot_programs pp
WHERE sub.program_id = pp.program_id
  AND sub.company_id IS NULL;

-- Handle submissions without a program (orphaned) - assign to default company
UPDATE submissions
SET company_id = (SELECT company_id FROM temp_default_company)
WHERE company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM submissions
  WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % submissions', v_updated_count;
END $$;

-- ==========================================
-- STEP 5: BACKFILL PETRI_OBSERVATIONS
-- ==========================================

-- Update petri_observations.company_id from their associated program
UPDATE petri_observations po
SET company_id = pp.company_id
FROM pilot_programs pp
WHERE po.program_id = pp.program_id
  AND po.company_id IS NULL;

-- Fallback: derive from submission if program_id is null
UPDATE petri_observations po
SET company_id = sub.company_id
FROM submissions sub
WHERE po.submission_id = sub.submission_id
  AND po.company_id IS NULL;

-- Handle orphaned observations - assign to default company
UPDATE petri_observations
SET company_id = (SELECT company_id FROM temp_default_company)
WHERE company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM petri_observations
  WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % petri_observations', v_updated_count;
END $$;

-- ==========================================
-- STEP 6: BACKFILL GASIFIER_OBSERVATIONS
-- ==========================================

-- Update gasifier_observations.company_id from their associated program
UPDATE gasifier_observations go
SET company_id = pp.company_id
FROM pilot_programs pp
WHERE go.program_id = pp.program_id
  AND go.company_id IS NULL;

-- Fallback: derive from submission if program_id is null
UPDATE gasifier_observations go
SET company_id = sub.company_id
FROM submissions sub
WHERE go.submission_id = sub.submission_id
  AND go.company_id IS NULL;

-- Handle orphaned observations - assign to default company
UPDATE gasifier_observations
SET company_id = (SELECT company_id FROM temp_default_company)
WHERE company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM gasifier_observations
  WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % gasifier_observations', v_updated_count;
END $$;

-- ==========================================
-- STEP 7: BACKFILL DEVICES
-- ==========================================

-- Update devices.company_id from their associated program
UPDATE devices d
SET company_id = pp.company_id
FROM pilot_programs pp
WHERE d.program_id = pp.program_id
  AND d.company_id IS NULL;

-- Fallback: derive from site's program if device has no direct program
UPDATE devices d
SET company_id = pp.company_id
FROM sites s
JOIN pilot_programs pp ON s.program_id = pp.program_id
WHERE d.site_id = s.site_id
  AND d.company_id IS NULL;

-- Handle orphaned devices - assign to default company
UPDATE devices
SET company_id = (SELECT company_id FROM temp_default_company)
WHERE company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM devices
  WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % devices', v_updated_count;
END $$;

-- ==========================================
-- STEP 8: BACKFILL DEVICE_TELEMETRY
-- ==========================================

UPDATE device_telemetry dt
SET company_id = d.company_id
FROM devices d
WHERE dt.device_id = d.device_id
  AND dt.company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM device_telemetry
  WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % device_telemetry records', v_updated_count;
END $$;

-- ==========================================
-- STEP 9: BACKFILL DEVICE_IMAGES
-- ==========================================

UPDATE device_images di
SET company_id = d.company_id
FROM devices d
WHERE di.device_id = d.device_id
  AND di.company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM device_images
  WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % device_images', v_updated_count;
END $$;

-- ==========================================
-- STEP 10: BACKFILL DEVICE_COMMANDS
-- ==========================================

UPDATE device_commands dc
SET company_id = d.company_id
FROM devices d
WHERE dc.device_id = d.device_id
  AND dc.company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM device_commands
  WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % device_commands', v_updated_count;
END $$;

-- ==========================================
-- STEP 11: BACKFILL DEVICE_ALERTS
-- ==========================================

UPDATE device_alerts da
SET company_id = d.company_id
FROM devices d
WHERE da.device_id = d.device_id
  AND da.company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM device_alerts
  WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % device_alerts', v_updated_count;
END $$;

-- ==========================================
-- STEP 12: BACKFILL DEVICE_WAKE_SESSIONS
-- ==========================================

UPDATE device_wake_sessions dws
SET company_id = d.company_id
FROM devices d
WHERE dws.device_id = d.device_id
  AND dws.company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM device_wake_sessions
  WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % device_wake_sessions', v_updated_count;
END $$;

-- ==========================================
-- STEP 13: BACKFILL DEVICE_HISTORY
-- ==========================================

UPDATE device_history dh
SET company_id = d.company_id
FROM devices d
WHERE dh.device_id = d.device_id
  AND dh.company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM device_history
  WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % device_history records', v_updated_count;
END $$;

-- ==========================================
-- STEP 14: BACKFILL SUBMISSION_SESSIONS
-- ==========================================

UPDATE submission_sessions ss
SET company_id = pp.company_id
FROM pilot_programs pp
WHERE ss.program_id = pp.program_id
  AND ss.company_id IS NULL;

-- Fallback: derive from site
UPDATE submission_sessions ss
SET company_id = s.company_id
FROM sites s
WHERE ss.site_id = s.site_id
  AND ss.company_id IS NULL;

-- Handle orphaned sessions - assign to default company
UPDATE submission_sessions
SET company_id = (SELECT company_id FROM temp_default_company)
WHERE company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM submission_sessions
  WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % submission_sessions', v_updated_count;
END $$;

-- ==========================================
-- STEP 15: BACKFILL PILOT_PROGRAM_HISTORY
-- ==========================================

UPDATE pilot_program_history pph
SET company_id = pp.company_id
FROM pilot_programs pp
WHERE pph.program_id = pp.program_id
  AND pph.company_id IS NULL;

-- Log the update
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM pilot_program_history
  WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % pilot_program_history records', v_updated_count;
END $$;

-- ==========================================
-- STEP 16: BACKFILL PILOT_PROGRAM_HISTORY_STAGING
-- ==========================================

UPDATE pilot_program_history_staging pphs
SET company_id = pp.company_id
FROM pilot_programs pp
WHERE pphs.program_id = pp.program_id
  AND pphs.company_id IS NULL;

-- ==========================================
-- STEP 17: BACKFILL JUNCTION TABLES
-- ==========================================

-- Device-Site Assignments
UPDATE device_site_assignments dsa
SET company_id = pp.company_id
FROM pilot_programs pp
WHERE dsa.program_id = pp.program_id
  AND dsa.company_id IS NULL;

-- Device-Program Assignments
UPDATE device_program_assignments dpa
SET company_id = pp.company_id
FROM pilot_programs pp
WHERE dpa.program_id = pp.program_id
  AND dpa.company_id IS NULL;

-- Site-Program Assignments
UPDATE site_program_assignments spa
SET company_id = pp.company_id
FROM pilot_programs pp
WHERE spa.program_id = pp.program_id
  AND spa.company_id IS NULL;

-- Log the updates
DO $$
DECLARE
  v_dsa_count INTEGER;
  v_dpa_count INTEGER;
  v_spa_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dsa_count FROM device_site_assignments WHERE company_id IS NOT NULL;
  SELECT COUNT(*) INTO v_dpa_count FROM device_program_assignments WHERE company_id IS NOT NULL;
  SELECT COUNT(*) INTO v_spa_count FROM site_program_assignments WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Backfilled company_id for % device_site_assignments', v_dsa_count;
  RAISE NOTICE 'Backfilled company_id for % device_program_assignments', v_dpa_count;
  RAISE NOTICE 'Backfilled company_id for % site_program_assignments', v_spa_count;
END $$;

-- ==========================================
-- STEP 18: VERIFY DATA INTEGRITY
-- ==========================================

DO $$
DECLARE
  v_null_programs INTEGER;
  v_null_sites INTEGER;
  v_null_submissions INTEGER;
  v_null_petri_obs INTEGER;
  v_null_gasifier_obs INTEGER;
  v_null_devices INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_programs FROM pilot_programs WHERE company_id IS NULL;
  SELECT COUNT(*) INTO v_null_sites FROM sites WHERE company_id IS NULL;
  SELECT COUNT(*) INTO v_null_submissions FROM submissions WHERE company_id IS NULL;
  SELECT COUNT(*) INTO v_null_petri_obs FROM petri_observations WHERE company_id IS NULL;
  SELECT COUNT(*) INTO v_null_gasifier_obs FROM gasifier_observations WHERE company_id IS NULL;
  SELECT COUNT(*) INTO v_null_devices FROM devices WHERE company_id IS NULL;

  RAISE NOTICE '=== DATA INTEGRITY CHECK ===';
  RAISE NOTICE 'Programs with NULL company_id: %', v_null_programs;
  RAISE NOTICE 'Sites with NULL company_id: %', v_null_sites;
  RAISE NOTICE 'Submissions with NULL company_id: %', v_null_submissions;
  RAISE NOTICE 'Petri observations with NULL company_id: %', v_null_petri_obs;
  RAISE NOTICE 'Gasifier observations with NULL company_id: %', v_null_gasifier_obs;
  RAISE NOTICE 'Devices with NULL company_id: %', v_null_devices;

  IF v_null_programs > 0 OR v_null_sites > 0 OR v_null_submissions > 0 THEN
    RAISE WARNING 'Some core records still have NULL company_id - please investigate';
  ELSE
    RAISE NOTICE 'All core records have company_id populated successfully';
  END IF;
END $$;

-- Clean up temporary table
DROP TABLE IF EXISTS temp_default_company;

-- Add final comment
COMMENT ON MIGRATION IS 'Backfilled company_id for all existing records - multi-tenancy data migration';
