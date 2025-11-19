/*
  # Fix Device Assignment Logging Enum Error

  1. Problem
    - When assigning device to site via fn_assign_device_to_site, getting error:
      "invalid input value for enum device_event_category: 'configuration'"
    - A trigger on devices table is using wrong enum value

  2. Solution
    - Create/fix trigger function to log device assignment changes
    - Use correct enum value: 'ConfigurationChange' (not 'configuration')

  3. Changes
    - Create log_device_assignment_change() function with correct enum
    - Add trigger on devices table to log site_id/program_id changes
*/

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_log_device_assignment ON devices;

-- Create or replace the logging function with CORRECT enum value
CREATE OR REPLACE FUNCTION log_device_assignment_change()
RETURNS TRIGGER AS $$
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

    -- Log to device_history with CORRECT enum value 'ConfigurationChange'
    INSERT INTO device_history (
      device_id,
      company_id,
      program_id,
      site_id,
      event_category,  -- This must be a valid device_event_category enum value
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
      'ConfigurationChange'::device_event_category,  -- CORRECT ENUM VALUE (not 'configuration')
      v_event_type,
      'info'::event_severity,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to log assignment changes
CREATE TRIGGER trigger_log_device_assignment
AFTER UPDATE ON devices
FOR EACH ROW
EXECUTE FUNCTION log_device_assignment_change();

COMMENT ON FUNCTION log_device_assignment_change() IS
  'Logs device assignment changes (site_id/program_id) to device_history with correct ConfigurationChange enum value';
