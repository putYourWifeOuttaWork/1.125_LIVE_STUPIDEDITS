/*
  # Company ID Propagation Triggers and Functions

  1. Purpose
    - Auto-populate company_id on new records based on related records
    - Ensure company_id consistency across related tables
    - Update company_id when relationships change (e.g., device program reassignment)
    - Validate cross-company operations

  2. Triggers Created
    - Auto-populate company_id on submissions from program
    - Auto-populate company_id on observations from program/submission
    - Auto-populate company_id on device telemetry/images/commands/alerts from device
    - Update device company_id when program assignment changes
    - Auto-populate company_id on junction tables
    - Validate company consistency

  3. Functions Created
    - populate_submission_company_id()
    - populate_observation_company_id()
    - populate_device_data_company_id()
    - update_device_company_id_from_program()
    - validate_company_consistency()
    - populate_junction_table_company_id()
*/

-- ==========================================
-- FUNCTION: Populate submission company_id
-- ==========================================

CREATE OR REPLACE FUNCTION populate_submission_company_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If company_id is not set, derive it from the program
  IF NEW.company_id IS NULL AND NEW.program_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM pilot_programs
    WHERE program_id = NEW.program_id;
  END IF;

  -- If still null, derive from site
  IF NEW.company_id IS NULL AND NEW.site_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM sites
    WHERE site_id = NEW.site_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for submissions
DROP TRIGGER IF EXISTS trigger_populate_submission_company_id ON submissions;
CREATE TRIGGER trigger_populate_submission_company_id
  BEFORE INSERT OR UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION populate_submission_company_id();

-- ==========================================
-- FUNCTION: Populate observation company_id
-- ==========================================

CREATE OR REPLACE FUNCTION populate_observation_company_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If company_id is not set, derive it from the program
  IF NEW.company_id IS NULL AND NEW.program_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM pilot_programs
    WHERE program_id = NEW.program_id;
  END IF;

  -- If still null, derive from submission
  IF NEW.company_id IS NULL AND NEW.submission_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM submissions
    WHERE submission_id = NEW.submission_id;
  END IF;

  -- If still null, derive from site
  IF NEW.company_id IS NULL AND NEW.site_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM sites
    WHERE site_id = NEW.site_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for petri_observations
DROP TRIGGER IF EXISTS trigger_populate_petri_observation_company_id ON petri_observations;
CREATE TRIGGER trigger_populate_petri_observation_company_id
  BEFORE INSERT OR UPDATE ON petri_observations
  FOR EACH ROW
  EXECUTE FUNCTION populate_observation_company_id();

-- Create trigger for gasifier_observations
DROP TRIGGER IF EXISTS trigger_populate_gasifier_observation_company_id ON gasifier_observations;
CREATE TRIGGER trigger_populate_gasifier_observation_company_id
  BEFORE INSERT OR UPDATE ON gasifier_observations
  FOR EACH ROW
  EXECUTE FUNCTION populate_observation_company_id();

-- ==========================================
-- FUNCTION: Populate device data company_id
-- ==========================================

CREATE OR REPLACE FUNCTION populate_device_data_company_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If company_id is not set, derive it from the device
  IF NEW.company_id IS NULL AND NEW.device_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM devices
    WHERE device_id = NEW.device_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for device-related tables
DROP TRIGGER IF EXISTS trigger_populate_device_telemetry_company_id ON device_telemetry;
CREATE TRIGGER trigger_populate_device_telemetry_company_id
  BEFORE INSERT OR UPDATE ON device_telemetry
  FOR EACH ROW
  EXECUTE FUNCTION populate_device_data_company_id();

DROP TRIGGER IF EXISTS trigger_populate_device_images_company_id ON device_images;
CREATE TRIGGER trigger_populate_device_images_company_id
  BEFORE INSERT OR UPDATE ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION populate_device_data_company_id();

DROP TRIGGER IF EXISTS trigger_populate_device_commands_company_id ON device_commands;
CREATE TRIGGER trigger_populate_device_commands_company_id
  BEFORE INSERT OR UPDATE ON device_commands
  FOR EACH ROW
  EXECUTE FUNCTION populate_device_data_company_id();

DROP TRIGGER IF EXISTS trigger_populate_device_alerts_company_id ON device_alerts;
CREATE TRIGGER trigger_populate_device_alerts_company_id
  BEFORE INSERT OR UPDATE ON device_alerts
  FOR EACH ROW
  EXECUTE FUNCTION populate_device_data_company_id();

DROP TRIGGER IF EXISTS trigger_populate_device_wake_sessions_company_id ON device_wake_sessions;
CREATE TRIGGER trigger_populate_device_wake_sessions_company_id
  BEFORE INSERT OR UPDATE ON device_wake_sessions
  FOR EACH ROW
  EXECUTE FUNCTION populate_device_data_company_id();

DROP TRIGGER IF EXISTS trigger_populate_device_history_company_id ON device_history;
CREATE TRIGGER trigger_populate_device_history_company_id
  BEFORE INSERT OR UPDATE ON device_history
  FOR EACH ROW
  EXECUTE FUNCTION populate_device_data_company_id();

-- ==========================================
-- FUNCTION: Update device company_id when program changes
-- ==========================================

CREATE OR REPLACE FUNCTION update_device_company_id_from_program()
RETURNS TRIGGER AS $$
DECLARE
  v_new_company_id UUID;
BEGIN
  -- When device's program_id changes, update its company_id
  IF NEW.program_id IS NOT NULL AND (OLD.program_id IS NULL OR OLD.program_id != NEW.program_id) THEN
    SELECT company_id INTO v_new_company_id
    FROM pilot_programs
    WHERE program_id = NEW.program_id;

    IF v_new_company_id IS NOT NULL THEN
      NEW.company_id := v_new_company_id;
    END IF;
  END IF;

  -- Fallback: If no program but has site, derive from site
  IF NEW.company_id IS NULL AND NEW.site_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM sites
    WHERE site_id = NEW.site_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for devices
DROP TRIGGER IF EXISTS trigger_update_device_company_id_from_program ON devices;
CREATE TRIGGER trigger_update_device_company_id_from_program
  BEFORE INSERT OR UPDATE OF program_id, site_id ON devices
  FOR EACH ROW
  EXECUTE FUNCTION update_device_company_id_from_program();

-- ==========================================
-- FUNCTION: Populate junction table company_id
-- ==========================================

CREATE OR REPLACE FUNCTION populate_junction_table_company_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Derive company_id from program_id
  IF NEW.company_id IS NULL AND NEW.program_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM pilot_programs
    WHERE program_id = NEW.program_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for junction tables
DROP TRIGGER IF EXISTS trigger_populate_device_site_assignment_company_id ON device_site_assignments;
CREATE TRIGGER trigger_populate_device_site_assignment_company_id
  BEFORE INSERT OR UPDATE ON device_site_assignments
  FOR EACH ROW
  EXECUTE FUNCTION populate_junction_table_company_id();

DROP TRIGGER IF EXISTS trigger_populate_device_program_assignment_company_id ON device_program_assignments;
CREATE TRIGGER trigger_populate_device_program_assignment_company_id
  BEFORE INSERT OR UPDATE ON device_program_assignments
  FOR EACH ROW
  EXECUTE FUNCTION populate_junction_table_company_id();

DROP TRIGGER IF EXISTS trigger_populate_site_program_assignment_company_id ON site_program_assignments;
CREATE TRIGGER trigger_populate_site_program_assignment_company_id
  BEFORE INSERT OR UPDATE ON site_program_assignments
  FOR EACH ROW
  EXECUTE FUNCTION populate_junction_table_company_id();

-- ==========================================
-- FUNCTION: Populate submission_sessions company_id
-- ==========================================

CREATE OR REPLACE FUNCTION populate_submission_session_company_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Derive company_id from program
  IF NEW.company_id IS NULL AND NEW.program_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM pilot_programs
    WHERE program_id = NEW.program_id;
  END IF;

  -- Fallback: derive from site
  IF NEW.company_id IS NULL AND NEW.site_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM sites
    WHERE site_id = NEW.site_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for submission_sessions
DROP TRIGGER IF EXISTS trigger_populate_submission_session_company_id ON submission_sessions;
CREATE TRIGGER trigger_populate_submission_session_company_id
  BEFORE INSERT OR UPDATE ON submission_sessions
  FOR EACH ROW
  EXECUTE FUNCTION populate_submission_session_company_id();

-- ==========================================
-- FUNCTION: Populate audit log company_id
-- ==========================================

CREATE OR REPLACE FUNCTION populate_audit_log_company_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Derive company_id from program if available
  IF NEW.company_id IS NULL AND NEW.program_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM pilot_programs
    WHERE program_id = NEW.program_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for pilot_program_history
DROP TRIGGER IF EXISTS trigger_populate_program_history_company_id ON pilot_program_history;
CREATE TRIGGER trigger_populate_program_history_company_id
  BEFORE INSERT ON pilot_program_history
  FOR EACH ROW
  EXECUTE FUNCTION populate_audit_log_company_id();

-- Create trigger for pilot_program_history_staging
DROP TRIGGER IF EXISTS trigger_populate_program_history_staging_company_id ON pilot_program_history_staging;
CREATE TRIGGER trigger_populate_program_history_staging_company_id
  BEFORE INSERT ON pilot_program_history_staging
  FOR EACH ROW
  EXECUTE FUNCTION populate_audit_log_company_id();

-- ==========================================
-- FUNCTION: Validate company consistency
-- ==========================================

CREATE OR REPLACE FUNCTION validate_company_consistency()
RETURNS TRIGGER AS $$
DECLARE
  v_program_company_id UUID;
  v_site_company_id UUID;
BEGIN
  -- For submissions: ensure program and site belong to same company
  IF TG_TABLE_NAME = 'submissions' THEN
    IF NEW.program_id IS NOT NULL THEN
      SELECT company_id INTO v_program_company_id
      FROM pilot_programs
      WHERE program_id = NEW.program_id;
    END IF;

    IF NEW.site_id IS NOT NULL THEN
      SELECT company_id INTO v_site_company_id
      FROM sites
      WHERE site_id = NEW.site_id;
    END IF;

    IF v_program_company_id IS NOT NULL AND v_site_company_id IS NOT NULL
       AND v_program_company_id != v_site_company_id THEN
      RAISE EXCEPTION 'Cannot create submission: program and site belong to different companies';
    END IF;

    -- Ensure company_id matches program/site
    IF NEW.company_id IS NOT NULL THEN
      IF v_program_company_id IS NOT NULL AND NEW.company_id != v_program_company_id THEN
        RAISE EXCEPTION 'Submission company_id does not match program company';
      END IF;
      IF v_site_company_id IS NOT NULL AND NEW.company_id != v_site_company_id THEN
        RAISE EXCEPTION 'Submission company_id does not match site company';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create validation trigger for submissions
DROP TRIGGER IF EXISTS trigger_validate_submission_company_consistency ON submissions;
CREATE TRIGGER trigger_validate_submission_company_consistency
  BEFORE INSERT OR UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION validate_company_consistency();

-- ==========================================
-- FUNCTION: Cascade company_id updates to related device records
-- ==========================================

CREATE OR REPLACE FUNCTION cascade_device_company_id_update()
RETURNS TRIGGER AS $$
BEGIN
  -- When device's company_id changes, update all related records
  IF NEW.company_id IS NOT NULL AND (OLD.company_id IS NULL OR OLD.company_id != NEW.company_id) THEN
    -- Update device telemetry
    UPDATE device_telemetry
    SET company_id = NEW.company_id
    WHERE device_id = NEW.device_id;

    -- Update device images
    UPDATE device_images
    SET company_id = NEW.company_id
    WHERE device_id = NEW.device_id;

    -- Update device commands
    UPDATE device_commands
    SET company_id = NEW.company_id
    WHERE device_id = NEW.device_id;

    -- Update device alerts
    UPDATE device_alerts
    SET company_id = NEW.company_id
    WHERE device_id = NEW.device_id;

    -- Update device wake sessions
    UPDATE device_wake_sessions
    SET company_id = NEW.company_id
    WHERE device_id = NEW.device_id;

    -- Update device history
    UPDATE device_history
    SET company_id = NEW.company_id
    WHERE device_id = NEW.device_id;

    RAISE NOTICE 'Cascaded company_id update for device % to company %', NEW.device_id, NEW.company_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for cascading device company_id updates
DROP TRIGGER IF EXISTS trigger_cascade_device_company_id_update ON devices;
CREATE TRIGGER trigger_cascade_device_company_id_update
  AFTER UPDATE OF company_id ON devices
  FOR EACH ROW
  WHEN (OLD.company_id IS DISTINCT FROM NEW.company_id)
  EXECUTE FUNCTION cascade_device_company_id_update();

-- ==========================================
-- HELPER FUNCTION: Get company_id from program_id
-- ==========================================

CREATE OR REPLACE FUNCTION get_company_id_from_program(p_program_id UUID)
RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id
  FROM pilot_programs
  WHERE program_id = p_program_id;

  RETURN v_company_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ==========================================
-- HELPER FUNCTION: Get company_id from site_id
-- ==========================================

CREATE OR REPLACE FUNCTION get_company_id_from_site(p_site_id UUID)
RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id
  FROM sites
  WHERE site_id = p_site_id;

  RETURN v_company_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_company_id_from_program(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_company_id_from_site(UUID) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION populate_submission_company_id IS 'Auto-populate company_id on submissions from program or site';
COMMENT ON FUNCTION populate_observation_company_id IS 'Auto-populate company_id on observations from program, submission, or site';
COMMENT ON FUNCTION populate_device_data_company_id IS 'Auto-populate company_id on device-related records from parent device';
COMMENT ON FUNCTION update_device_company_id_from_program IS 'Update device company_id when program assignment changes';
COMMENT ON FUNCTION populate_junction_table_company_id IS 'Auto-populate company_id on junction tables from program';
COMMENT ON FUNCTION validate_company_consistency IS 'Validate that related records belong to the same company';
COMMENT ON FUNCTION cascade_device_company_id_update IS 'Cascade company_id updates from device to all related records';
COMMENT ON FUNCTION get_company_id_from_program IS 'Helper function to get company_id from program_id';
COMMENT ON FUNCTION get_company_id_from_site IS 'Helper function to get company_id from site_id';
