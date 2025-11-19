/*
  # Fix Device Command Trigger Column Names

  1. Problem
    - log_device_command() trigger references non-existent columns:
      - NEW.parameters (should be NEW.command_payload)
      - NEW.issued_by (should be NEW.created_by_user_id)
      - NEW.site_id (device_commands table doesn't have this column)

  2. Solution
    - Update trigger function to use correct column names
    - Remove reference to non-existent site_id column

  3. Effect
    - Device command creation now works without errors
    - Device history properly logs command events
*/

-- ==========================================
-- Fix Device Command Logging Trigger
-- ==========================================

CREATE OR REPLACE FUNCTION log_device_command()
RETURNS TRIGGER AS $$
DECLARE
  v_description text;
  v_event_type text;
  v_severity event_severity;
  v_device_site_id uuid;
  v_device_program_id uuid;
  v_device_company_id uuid;
BEGIN
  -- Get device context (site, program, company)
  SELECT site_id, program_id, company_id
  INTO v_device_site_id, v_device_program_id, v_device_company_id
  FROM devices
  WHERE device_id = NEW.device_id;

  -- Determine event details based on command status
  IF TG_OP = 'INSERT' THEN
    v_description := format('Command issued: %s', NEW.command_type);
    v_event_type := 'command_issued_' || NEW.command_type;
    v_severity := 'info';
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    IF NEW.status = 'acknowledged' THEN
      v_description := format('Command acknowledged: %s', NEW.command_type);
      v_event_type := 'command_ack_' || NEW.command_type;
      v_severity := 'info';
    ELSIF NEW.status = 'failed' THEN
      v_description := format('Command failed: %s - %s', NEW.command_type, COALESCE(NEW.error_message, 'Unknown error'));
      v_event_type := 'command_failed_' || NEW.command_type;
      v_severity := 'error';
    ELSE
      v_description := format('Command %s: %s', NEW.status, NEW.command_type);
      v_event_type := 'command_' || NEW.status || '_' || NEW.command_type;
      v_severity := 'info';
    END IF;
  ELSE
    RETURN NEW; -- Skip if not INSERT or status change
  END IF;

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
    COALESCE(NEW.company_id, v_device_company_id),
    COALESCE(NEW.program_id, v_device_program_id),
    v_device_site_id,
    'Command',
    v_event_type,
    v_severity,
    v_description,
    jsonb_build_object(
      'command_type', NEW.command_type,
      'command_payload', NEW.command_payload,
      'status', NEW.status,
      'priority', COALESCE(NEW.priority, 5)
    ),
    jsonb_build_object(
      'command_id', NEW.command_id,
      'issued_at', NEW.issued_at,
      'acknowledged_at', NEW.acknowledged_at,
      'completed_at', NEW.completed_at,
      'error_message', NEW.error_message
    ),
    CASE WHEN TG_OP = 'INSERT' THEN 'user' ELSE 'device' END,
    'device_commands',
    NEW.command_id,
    NEW.created_by_user_id,
    COALESCE(NEW.acknowledged_at, NEW.delivered_at, NEW.issued_at)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger to ensure it's using the fixed function
DROP TRIGGER IF EXISTS trigger_log_device_command ON device_commands;
CREATE TRIGGER trigger_log_device_command
AFTER INSERT OR UPDATE ON device_commands
FOR EACH ROW
EXECUTE FUNCTION log_device_command();

COMMENT ON FUNCTION log_device_command IS 'Logs device command events to device_history - fixed to use correct column names';
