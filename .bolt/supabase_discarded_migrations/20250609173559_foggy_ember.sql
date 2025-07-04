/*
  # Fix User Action Validation Error
  
  1. Changes
    - Updates log_program_user_history function to remove invalid 'UserUpdate' event type
    - Ensures only valid history_event_type_enum values are used
    - Skips history logging for updates that aren't role changes
  
  2. Issue Fixed
    - Resolves "invalid input value for enum history_event_type_enum: 'UserUpdate'" error
    - Fixes issue with user actions failing after using Undo functionality
*/

-- Create or replace the log_program_user_history function with fixed logic
CREATE OR REPLACE FUNCTION log_program_user_history()
RETURNS TRIGGER AS $$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
  target_user_email TEXT;
BEGIN
  -- Handle the case when the operation is performed by the system or during migration
  IF auth.uid() IS NULL THEN
    RETURN NULL; -- Skip logging if there's no authenticated user
  END IF;

  -- Determine program ID based on operation
  program_id_val := CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END;
  
  -- Get details of the user being added/modified/removed
  IF TG_OP = 'DELETE' THEN
    SELECT email INTO target_user_email FROM users WHERE id = OLD.user_id;
  ELSE
    SELECT email INTO target_user_email FROM users WHERE id = NEW.user_id;
  END IF;
  
  -- Determine the history event type
  IF TG_OP = 'INSERT' THEN
    history_type := 'UserAdded';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role != NEW.role THEN
      history_type := 'UserRoleChanged';
    ELSE
      -- Skip history logging for updates that aren't role changes
      RETURN NULL;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'UserRemoved';
  END IF;
  
  -- Get user details of the user performing the action
  SELECT * FROM get_user_audit_details(program_id_val) INTO user_details;
  
  -- Insert history record
  INSERT INTO pilot_program_history (
    update_type, 
    object_id, 
    object_type,
    program_id,
    user_id,
    user_email,
    user_company,
    user_role,
    old_data, 
    new_data
  )
  VALUES (
    history_type,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    'program_user',
    program_id_val,
    user_details.user_id,
    user_details.user_email,
    user_details.user_company,
    user_details.user_role,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' 
      THEN jsonb_build_object(
        'id', OLD.id,
        'program_id', OLD.program_id,
        'user_id', OLD.user_id,
        'role', OLD.role,
        'user_email', target_user_email
      ) 
      ELSE NULL 
    END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' 
      THEN jsonb_build_object(
        'id', NEW.id,
        'program_id', NEW.program_id,
        'user_id', NEW.user_id,
        'role', NEW.role,
        'user_email', target_user_email
      ) 
      ELSE NULL 
    END
  );
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate the trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS log_program_user_history_trigger ON pilot_program_users;
CREATE TRIGGER log_program_user_history_trigger
AFTER INSERT OR UPDATE OR DELETE ON pilot_program_users
FOR EACH ROW EXECUTE FUNCTION log_program_user_history();