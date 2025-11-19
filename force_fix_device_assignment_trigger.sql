/*
  # Force Fix Device Assignment Trigger (Complete Rebuild)

  1. Problem
    - Previous migration created trigger but enum error persists
    - Need to completely drop and recreate to clear any caching

  2. Solution
    - Drop trigger completely
    - Drop function completely
    - Recreate from scratch with correct enum value
    - Use explicit casting to ensure type safety

  3. Changes
    - DROP TRIGGER IF EXISTS (all variants)
    - DROP FUNCTION IF EXISTS (with CASCADE)
    - CREATE fresh function with ConfigurationChange enum
    - CREATE fresh trigger
*/

-- ==========================================
-- STEP 1: Remove ALL existing triggers/functions
-- ==========================================

-- Drop all possible trigger variants
DROP TRIGGER IF EXISTS trigger_log_device_assignment ON devices CASCADE;
DROP TRIGGER IF EXISTS trg_log_device_assignment ON devices CASCADE;
DROP TRIGGER IF EXISTS trg_device_assignment_log ON devices CASCADE;

-- Drop the function completely with CASCADE to remove dependencies
DROP FUNCTION IF EXISTS log_device_assignment_change() CASCADE;

-- ==========================================
-- STEP 2: Create FRESH function with correct enum
-- ==========================================

CREATE FUNCTION log_device_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_description text;
  v_event_type text;
BEGIN
  -- Only log if site_id or program_id changed
  IF TG_OP = 'UPDATE' AND (
    OLD.site_id IS DISTINCT FROM NEW.site_id OR
    OLD.program_id IS DISTINCT FROM NEW.program_id
  ) THEN

    -- Determine what changed
    IF OLD.site_id IS DISTINCT FROM NEW.site_id AND OLD.program_id IS DISTINCT FROM NEW.program_id THEN
      v_description := format('Device assigned: site_id=%s, program_id=%s', NEW.site_id, NEW.program_id);
      v_event_type := 'device_assigned';
    ELSIF OLD.site_id IS DISTINCT FROM NEW.site_id THEN
      IF NEW.site_id IS NULL THEN
        v_description := 'Device removed from site';
        v_event_type := 'device_unassigned_site';
      ELSE
        v_description := format('Device site changed to %s', NEW.site_id);
        v_event_type := 'device_site_changed';
      END IF;
    ELSIF OLD.program_id IS DISTINCT FROM NEW.program_id THEN
      IF NEW.program_id IS NULL THEN
        v_description := 'Device removed from program';
        v_event_type := 'device_unassigned_program';
      ELSE
        v_description := format('Device program changed to %s', NEW.program_id);
        v_event_type := 'device_program_changed';
      END IF;
    END IF;

    -- Log to device_history with EXPLICIT CASTING to correct enum value
    INSERT INTO device_history (
      device_id,
      company_id,
      program_id,
      site_id,
      event_category,
      event_type,
      severity,
      description,
      event_data,
      metadata,
      triggered_by,
      source_table,
      source_id,
      user_id,
      event_timestamp
    ) VALUES (
      NEW.device_id,
      NEW.company_id,
      NEW.program_id,
      NEW.site_id,
      'ConfigurationChange'::device_event_category,  -- EXPLICIT CAST
      v_event_type,
      'info'::event_severity,  -- EXPLICIT CAST
      v_description,
      jsonb_build_object(
        'old_site_id', OLD.site_id,
        'new_site_id', NEW.site_id,
        'old_program_id', OLD.program_id,
        'new_program_id', NEW.program_id,
        'x_position', NEW.x_position,
        'y_position', NEW.y_position
      ),
      jsonb_build_object(
        'changed_at', now(),
        'changed_by', auth.uid()
      ),
      'user',
      'devices',
      NEW.device_id,
      auth.uid(),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ==========================================
-- STEP 3: Create FRESH trigger
-- ==========================================

CREATE TRIGGER trigger_log_device_assignment
  AFTER UPDATE OF site_id, program_id ON devices
  FOR EACH ROW
  EXECUTE FUNCTION log_device_assignment_change();

-- ==========================================
-- STEP 4: Add comments
-- ==========================================

COMMENT ON FUNCTION log_device_assignment_change() IS
  'Logs device assignment changes (site_id/program_id) to device_history.
   Uses ConfigurationChange enum value (not "configuration").
   Rebuilt to fix enum casting issue.';

COMMENT ON TRIGGER trigger_log_device_assignment ON devices IS
  'Logs device site/program assignment changes to device_history with proper enum values';
