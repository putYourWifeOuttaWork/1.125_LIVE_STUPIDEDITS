-- Create a new enum for history event types
CREATE TYPE history_event_type_enum AS ENUM (
  'ProgramCreation',
  'ProgramUpdate',
  'ProgramDeletion',
  'SiteCreation',
  'SiteUpdate',
  'SiteDeletion',
  'SubmissionCreation',
  'SubmissionUpdate',
  'SubmissionDeletion',
  'PetriCreation',
  'PetriUpdate',
  'PetriDeletion',
  'UserAdded',
  'UserRemoved',
  'UserRoleChanged'
);

-- Create the pilot_program_history table
CREATE TABLE pilot_program_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  update_type history_event_type_enum NOT NULL,
  object_id UUID NOT NULL,
  object_type TEXT NOT NULL,
  program_id UUID,
  user_id UUID,
  user_email TEXT,
  user_company TEXT,
  user_role TEXT,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT
);

-- Create indexes for better performance
CREATE INDEX idx_history_program_id ON pilot_program_history(program_id);
CREATE INDEX idx_history_object_id ON pilot_program_history(object_id);
CREATE INDEX idx_history_user_id ON pilot_program_history(user_id);
CREATE INDEX idx_history_event_timestamp ON pilot_program_history(event_timestamp);

-- Function to get user details for audit
CREATE OR REPLACE FUNCTION get_user_audit_details(program_uuid UUID)
RETURNS TABLE(
  user_id UUID,
  user_email TEXT,
  user_company TEXT,
  user_role TEXT
) AS $$
DECLARE
  auth_user_id UUID;
BEGIN
  -- Get the current user ID
  auth_user_id := auth.uid();
  
  IF auth_user_id IS NULL THEN
    -- If running in a context without auth (like a database trigger)
    -- return NULL values for all fields
    RETURN QUERY
    SELECT 
      NULL::UUID as user_id,
      NULL::TEXT as user_email,
      NULL::TEXT as user_company,
      NULL::TEXT as user_role;
  ELSE
    -- Get user details including their role in the specified program
    RETURN QUERY
    SELECT 
      u.id,
      u.email,
      u.company,
      ppu.role::TEXT
    FROM 
      users u
    LEFT JOIN 
      pilot_program_users ppu ON u.id = ppu.user_id AND ppu.program_id = program_uuid
    WHERE 
      u.id = auth_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function for pilot_programs
CREATE OR REPLACE FUNCTION log_pilot_program_history()
RETURNS TRIGGER AS $$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
BEGIN
  -- Determine the history event type
  IF TG_OP = 'INSERT' THEN
    history_type := 'ProgramCreation';
  ELSIF TG_OP = 'UPDATE' THEN
    history_type := 'ProgramUpdate';
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'ProgramDeletion';
  END IF;
  
  -- Get user details
  SELECT * FROM get_user_audit_details(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END
  ) INTO user_details;
  
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
    CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END,
    'pilot_program',
    CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END,
    user_details.user_id,
    user_details.user_email,
    user_details.user_company,
    user_details.user_role,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for sites
CREATE OR REPLACE FUNCTION log_site_history()
RETURNS TRIGGER AS $$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
BEGIN
  -- Determine program ID based on operation
  program_id_val := CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END;
  
  -- Determine the history event type
  IF TG_OP = 'INSERT' THEN
    history_type := 'SiteCreation';
  ELSIF TG_OP = 'UPDATE' THEN
    history_type := 'SiteUpdate';
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'SiteDeletion';
  END IF;
  
  -- Get user details
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
    CASE WHEN TG_OP = 'DELETE' THEN OLD.site_id ELSE NEW.site_id END,
    'site',
    program_id_val,
    user_details.user_id,
    user_details.user_email,
    user_details.user_company,
    user_details.user_role,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for submissions
CREATE OR REPLACE FUNCTION log_submission_history()
RETURNS TRIGGER AS $$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
BEGIN
  -- Determine program ID based on operation
  program_id_val := CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END;
  
  -- Determine the history event type
  IF TG_OP = 'INSERT' THEN
    history_type := 'SubmissionCreation';
  ELSIF TG_OP = 'UPDATE' THEN
    history_type := 'SubmissionUpdate';
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'SubmissionDeletion';
  END IF;
  
  -- Get user details
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
    CASE WHEN TG_OP = 'DELETE' THEN OLD.submission_id ELSE NEW.submission_id END,
    'submission',
    program_id_val,
    user_details.user_id,
    user_details.user_email,
    user_details.user_company,
    user_details.user_role,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for petri_observations
CREATE OR REPLACE FUNCTION log_petri_observation_history()
RETURNS TRIGGER AS $$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
BEGIN
  -- We need to get the program_id from the submission
  IF TG_OP = 'DELETE' THEN
    SELECT program_id INTO program_id_val FROM submissions WHERE submission_id = OLD.submission_id;
  ELSE
    SELECT program_id INTO program_id_val FROM submissions WHERE submission_id = NEW.submission_id;
  END IF;
  
  -- Determine the history event type
  IF TG_OP = 'INSERT' THEN
    history_type := 'PetriCreation';
  ELSIF TG_OP = 'UPDATE' THEN
    history_type := 'PetriUpdate';
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'PetriDeletion';
  END IF;
  
  -- Get user details
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
    CASE WHEN TG_OP = 'DELETE' THEN OLD.observation_id ELSE NEW.observation_id END,
    'petri_observation',
    program_id_val,
    user_details.user_id,
    user_details.user_email,
    user_details.user_company,
    user_details.user_role,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for pilot_program_users
CREATE OR REPLACE FUNCTION log_program_user_history()
RETURNS TRIGGER AS $$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
  target_user_email TEXT;
BEGIN
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
      history_type := 'UserUpdate';
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

-- Create triggers for each table
CREATE TRIGGER log_pilot_program_history_trigger
AFTER INSERT OR UPDATE OR DELETE ON pilot_programs
FOR EACH ROW EXECUTE FUNCTION log_pilot_program_history();

CREATE TRIGGER log_site_history_trigger
AFTER INSERT OR UPDATE OR DELETE ON sites
FOR EACH ROW EXECUTE FUNCTION log_site_history();

CREATE TRIGGER log_submission_history_trigger
AFTER INSERT OR UPDATE OR DELETE ON submissions
FOR EACH ROW EXECUTE FUNCTION log_submission_history();

CREATE TRIGGER log_petri_observation_history_trigger
AFTER INSERT OR UPDATE OR DELETE ON petri_observations
FOR EACH ROW EXECUTE FUNCTION log_petri_observation_history();

CREATE TRIGGER log_program_user_history_trigger
AFTER INSERT OR UPDATE OR DELETE ON pilot_program_users
FOR EACH ROW EXECUTE FUNCTION log_program_user_history();

-- Enable RLS on the history table
ALTER TABLE pilot_program_history ENABLE ROW LEVEL SECURITY;

-- Create policy for viewing history - only admins can see history for their programs
CREATE POLICY "Users can view history for their programs" ON pilot_program_history
  FOR SELECT
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users 
      WHERE user_id = auth.uid() AND role = 'Admin'
    )
  );

-- Add comments for documentation
COMMENT ON TABLE pilot_program_history IS 'Audit trail for all changes to pilot program data';
COMMENT ON COLUMN pilot_program_history.update_type IS 'Type of change (e.g., creation, update, deletion)';
COMMENT ON COLUMN pilot_program_history.object_id IS 'UUID of the affected record';
COMMENT ON COLUMN pilot_program_history.object_type IS 'Type of object affected (e.g., pilot_program, site, submission)';
COMMENT ON COLUMN pilot_program_history.old_data IS 'JSON representation of the record before the change';
COMMENT ON COLUMN pilot_program_history.new_data IS 'JSON representation of the record after the change';