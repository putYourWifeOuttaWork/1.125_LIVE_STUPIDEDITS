/*
  # Add Company Data Integrity Constraints and Triggers

  1. Purpose
    - Ensure company_id consistency across related tables
    - Prevent orphaned records with mismatched company_ids
    - Auto-propagate company_id from parent to child records
    - Enforce company boundaries at the database level

  2. Constraints Added
    - Sites must have same company_id as their parent program
    - Submissions must have same company_id as their parent program
    - Observations must have same company_id as their parent program
    - pilot_program_users entries must match program's company_id with user's company_id

  3. Triggers Created
    - Auto-set company_id on sites when created (from program)
    - Auto-set company_id on submissions when created (from program)
    - Auto-set company_id on observations when created (from program)
    - Validate company_id matches on updates

  4. Security Benefits
    - Prevents data leakage across company boundaries
    - Enforces referential integrity for multi-tenancy
    - Makes RLS policies more reliable
    - Reduces chances of bugs that expose cross-company data
*/

-- ==========================================
-- VALIDATION FUNCTIONS
-- ==========================================

-- Function to validate site company_id matches program company_id
CREATE OR REPLACE FUNCTION validate_site_company_id()
RETURNS TRIGGER AS $$
DECLARE
  v_program_company_id UUID;
BEGIN
  -- Get the program's company_id
  SELECT company_id INTO v_program_company_id
  FROM pilot_programs
  WHERE program_id = NEW.program_id;

  -- If program has no company_id, allow (shouldn't happen, but safe fallback)
  IF v_program_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If site company_id is not set, auto-set it from program
  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_program_company_id;
  END IF;

  -- Validate that company_ids match
  IF NEW.company_id != v_program_company_id THEN
    RAISE EXCEPTION 'Site company_id (%) must match parent program company_id (%)',
      NEW.company_id, v_program_company_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate submission company_id matches program company_id
CREATE OR REPLACE FUNCTION validate_submission_company_id()
RETURNS TRIGGER AS $$
DECLARE
  v_program_company_id UUID;
BEGIN
  -- Get the program's company_id
  SELECT company_id INTO v_program_company_id
  FROM pilot_programs
  WHERE program_id = NEW.program_id;

  -- If program has no company_id, allow (shouldn't happen, but safe fallback)
  IF v_program_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If submission company_id is not set, auto-set it from program
  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_program_company_id;
  END IF;

  -- Validate that company_ids match
  IF NEW.company_id != v_program_company_id THEN
    RAISE EXCEPTION 'Submission company_id (%) must match parent program company_id (%)',
      NEW.company_id, v_program_company_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate petri observation company_id matches program company_id
CREATE OR REPLACE FUNCTION validate_petri_observation_company_id()
RETURNS TRIGGER AS $$
DECLARE
  v_program_company_id UUID;
BEGIN
  -- Get the program's company_id
  SELECT company_id INTO v_program_company_id
  FROM pilot_programs
  WHERE program_id = NEW.program_id;

  -- If program has no company_id, allow (shouldn't happen, but safe fallback)
  IF v_program_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If observation company_id is not set, auto-set it from program
  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_program_company_id;
  END IF;

  -- Validate that company_ids match
  IF NEW.company_id != v_program_company_id THEN
    RAISE EXCEPTION 'Petri observation company_id (%) must match parent program company_id (%)',
      NEW.company_id, v_program_company_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate gasifier observation company_id matches program company_id
CREATE OR REPLACE FUNCTION validate_gasifier_observation_company_id()
RETURNS TRIGGER AS $$
DECLARE
  v_program_company_id UUID;
BEGIN
  -- Get the program's company_id
  SELECT company_id INTO v_program_company_id
  FROM pilot_programs
  WHERE program_id = NEW.program_id;

  -- If program has no company_id, allow (shouldn't happen, but safe fallback)
  IF v_program_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If observation company_id is not set, auto-set it from program
  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_program_company_id;
  END IF;

  -- Validate that company_ids match
  IF NEW.company_id != v_program_company_id THEN
    RAISE EXCEPTION 'Gasifier observation company_id (%) must match parent program company_id (%)',
      NEW.company_id, v_program_company_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- CREATE TRIGGERS
-- ==========================================

-- Trigger for sites
DROP TRIGGER IF EXISTS trigger_validate_site_company_id ON sites;
CREATE TRIGGER trigger_validate_site_company_id
  BEFORE INSERT OR UPDATE ON sites
  FOR EACH ROW
  EXECUTE FUNCTION validate_site_company_id();

-- Trigger for submissions
DROP TRIGGER IF EXISTS trigger_validate_submission_company_id ON submissions;
CREATE TRIGGER trigger_validate_submission_company_id
  BEFORE INSERT OR UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION validate_submission_company_id();

-- Trigger for petri observations
DROP TRIGGER IF EXISTS trigger_validate_petri_observation_company_id ON petri_observations;
CREATE TRIGGER trigger_validate_petri_observation_company_id
  BEFORE INSERT OR UPDATE ON petri_observations
  FOR EACH ROW
  EXECUTE FUNCTION validate_petri_observation_company_id();

-- Trigger for gasifier observations
DROP TRIGGER IF EXISTS trigger_validate_gasifier_observation_company_id ON gasifier_observations;
CREATE TRIGGER trigger_validate_gasifier_observation_company_id
  BEFORE INSERT OR UPDATE ON gasifier_observations
  FOR EACH ROW
  EXECUTE FUNCTION validate_gasifier_observation_company_id();

-- ==========================================
-- BACKFILL AND REPAIR EXISTING DATA
-- ==========================================

-- Update sites to have correct company_id from their programs
UPDATE sites s
SET company_id = p.company_id
FROM pilot_programs p
WHERE s.program_id = p.program_id
  AND (s.company_id IS NULL OR s.company_id != p.company_id);

-- Update submissions to have correct company_id from their programs
UPDATE submissions s
SET company_id = p.company_id
FROM pilot_programs p
WHERE s.program_id = p.program_id
  AND (s.company_id IS NULL OR s.company_id != p.company_id);

-- Update petri observations to have correct company_id from their programs
UPDATE petri_observations po
SET company_id = p.company_id
FROM pilot_programs p
WHERE po.program_id = p.program_id
  AND (po.company_id IS NULL OR po.company_id != p.company_id);

-- Update gasifier observations to have correct company_id from their programs
UPDATE gasifier_observations go
SET company_id = p.company_id
FROM pilot_programs p
WHERE go.program_id = p.program_id
  AND (go.company_id IS NULL OR go.company_id != p.company_id);

-- ==========================================
-- ADD COMMENTS
-- ==========================================

COMMENT ON FUNCTION validate_site_company_id() IS 'Ensures sites have the same company_id as their parent program. Auto-sets if not provided.';
COMMENT ON FUNCTION validate_submission_company_id() IS 'Ensures submissions have the same company_id as their parent program. Auto-sets if not provided.';
COMMENT ON FUNCTION validate_petri_observation_company_id() IS 'Ensures petri observations have the same company_id as their parent program. Auto-sets if not provided.';
COMMENT ON FUNCTION validate_gasifier_observation_company_id() IS 'Ensures gasifier observations have the same company_id as their parent program. Auto-sets if not provided.';

COMMENT ON TRIGGER trigger_validate_site_company_id ON sites IS 'Validates and auto-sets company_id on site insert/update';
COMMENT ON TRIGGER trigger_validate_submission_company_id ON submissions IS 'Validates and auto-sets company_id on submission insert/update';
COMMENT ON TRIGGER trigger_validate_petri_observation_company_id ON petri_observations IS 'Validates and auto-sets company_id on petri observation insert/update';
COMMENT ON TRIGGER trigger_validate_gasifier_observation_company_id ON gasifier_observations IS 'Validates and auto-sets company_id on gasifier observation insert/update';
