/*
  # Add Submission Sessions and Enhanced Location Tracking
  
  1. New Features
    - Creates submission_sessions table for tracking submission lifecycle
    - Adds location and timezone tracking for sites and submissions
    - Enhances observation tables with last updated tracking
    
  2. Tables
    - New submission_sessions table
    - Enhanced sites table with location fields
    - Enhanced submissions table with timezone field
    - Enhanced observation tables with last updated tracking
    
  3. Purpose
    - Enables persistent, resumable submission sessions
    - Supports location-aware field operations
    - Facilitates collaborative editing with change tracking
*/

-- Create session_status_enum
CREATE TYPE session_status_enum AS ENUM (
  'Opened',
  'Working', 
  'Completed', 
  'Cancelled', 
  'Expired', 
  'Escalated'
);

-- Create submission_sessions table
CREATE TABLE submission_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES pilot_programs(program_id) ON DELETE CASCADE,
  opened_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  session_start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_status session_status_enum NOT NULL DEFAULT 'Opened',
  completion_time TIMESTAMPTZ,
  completed_by_user_id UUID REFERENCES auth.users(id),
  percentage_complete NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  valid_petris_logged INTEGER NOT NULL DEFAULT 0,
  valid_gasifiers_logged INTEGER NOT NULL DEFAULT 0,
  escalated_to_user_ids UUID[],
  
  -- Create a unique constraint to ensure one active session per submission
  CONSTRAINT unique_active_submission_session UNIQUE (submission_id),
  
  -- Add constraint to ensure completion_time is set when status is Completed
  CONSTRAINT completion_time_required CHECK (
    session_status != 'Completed' OR completion_time IS NOT NULL
  ),
  
  -- Add constraint to ensure completed_by_user_id is set when status is Completed
  CONSTRAINT completed_by_required CHECK (
    session_status != 'Completed' OR completed_by_user_id IS NOT NULL
  )
);

-- Add timezone and location columns to sites
ALTER TABLE sites ADD COLUMN state TEXT;
ALTER TABLE sites ADD COLUMN country TEXT;
ALTER TABLE sites ADD COLUMN timezone TEXT;

-- Add timezone column to submissions
ALTER TABLE submissions ADD COLUMN submission_timezone TEXT;

-- Add last updated tracking to petri_observations
ALTER TABLE petri_observations ADD COLUMN last_updated_by_user_id UUID REFERENCES auth.users(id);
-- Note: lastupdated_by column already exists, but we'll alias it for clarity
ALTER TABLE petri_observations ADD COLUMN last_edit_time TIMESTAMPTZ DEFAULT now();

-- Add last updated tracking to gasifier_observations
ALTER TABLE gasifier_observations ADD COLUMN last_updated_by_user_id UUID REFERENCES auth.users(id);
-- Note: lastupdated_by column already exists, but we'll alias it for clarity
ALTER TABLE gasifier_observations ADD COLUMN last_edit_time TIMESTAMPTZ DEFAULT now();

-- Update triggers to maintain last_edit_time
CREATE OR REPLACE FUNCTION set_last_edit_time()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_edit_time = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_last_edit_time_petri_observations
BEFORE UPDATE ON petri_observations
FOR EACH ROW
EXECUTE PROCEDURE set_last_edit_time();

CREATE TRIGGER set_last_edit_time_gasifier_observations
BEFORE UPDATE ON gasifier_observations
FOR EACH ROW
EXECUTE PROCEDURE set_last_edit_time();

-- Create function to calculate percentage complete for a session
CREATE OR REPLACE FUNCTION calculate_session_percentage_complete(p_session_id UUID)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_submission_id UUID;
  v_petri_total INTEGER;
  v_gasifier_total INTEGER;
  v_petri_complete INTEGER;
  v_gasifier_complete INTEGER;
  v_percentage NUMERIC(5,2);
BEGIN
  -- Get the submission ID for this session
  SELECT submission_id INTO v_submission_id
  FROM submission_sessions
  WHERE session_id = p_session_id;
  
  -- Get total observations from site templates or count
  SELECT COUNT(*) INTO v_petri_total
  FROM petri_observations
  WHERE submission_id = v_submission_id;
  
  SELECT COUNT(*) INTO v_gasifier_total
  FROM gasifier_observations
  WHERE submission_id = v_submission_id;
  
  -- Get completed observations (where image_url is not null)
  SELECT COUNT(*) INTO v_petri_complete
  FROM petri_observations
  WHERE submission_id = v_submission_id
  AND image_url IS NOT NULL;
  
  SELECT COUNT(*) INTO v_gasifier_complete
  FROM gasifier_observations
  WHERE submission_id = v_submission_id
  AND image_url IS NOT NULL;
  
  -- Calculate percentage complete
  IF (v_petri_total + v_gasifier_total) > 0 THEN
    v_percentage := (v_petri_complete + v_gasifier_complete)::NUMERIC * 100 / (v_petri_total + v_gasifier_total)::NUMERIC;
  ELSE
    v_percentage := 0;
  END IF;
  
  -- Update the session's counts
  UPDATE submission_sessions
  SET 
    valid_petris_logged = v_petri_complete,
    valid_gasifiers_logged = v_gasifier_complete
  WHERE session_id = p_session_id;
  
  RETURN ROUND(v_percentage, 2);
END;
$$;

-- Create function to update session activity
CREATE OR REPLACE FUNCTION update_submission_session_activity(
  p_session_id UUID,
  p_last_activity_time TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_percentage_complete NUMERIC(5,2);
  v_result JSONB;
BEGIN
  -- Calculate the current percentage complete
  v_percentage_complete := calculate_session_percentage_complete(p_session_id);
  
  -- Update the session
  UPDATE submission_sessions
  SET 
    last_activity_time = p_last_activity_time,
    percentage_complete = v_percentage_complete,
    session_status = CASE 
      WHEN session_status = 'Opened' THEN 'Working'::session_status_enum
      ELSE session_status
    END
  WHERE session_id = p_session_id
  RETURNING to_jsonb(submission_sessions.*) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Create function to create a new submission session
CREATE OR REPLACE FUNCTION create_submission_session(
  p_site_id UUID,
  p_program_id UUID,
  p_submission_data JSONB,
  p_petri_templates JSONB DEFAULT NULL,
  p_gasifier_templates JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_submission_id UUID;
  v_session_id UUID;
  v_petri_template JSONB;
  v_gasifier_template JSONB;
  v_petri_count INTEGER;
  v_gasifier_count INTEGER;
  v_site_timezone TEXT;
  v_result JSONB;
BEGIN
  -- Get site timezone if available
  SELECT timezone INTO v_site_timezone
  FROM sites
  WHERE site_id = p_site_id;
  
  -- Create a new submission
  INSERT INTO submissions (
    site_id,
    program_id,
    temperature,
    humidity,
    airflow,
    odor_distance,
    weather,
    notes,
    created_by,
    indoor_temperature,
    indoor_humidity,
    submission_timezone
  )
  VALUES (
    p_site_id,
    p_program_id,
    (p_submission_data->>'temperature')::NUMERIC,
    (p_submission_data->>'humidity')::NUMERIC,
    (p_submission_data->>'airflow')::airflow_enum,
    (p_submission_data->>'odor_distance')::odor_distance_enum,
    (p_submission_data->>'weather')::weather_enum,
    p_submission_data->>'notes',
    auth.uid(),
    (p_submission_data->>'indoor_temperature')::NUMERIC,
    (p_submission_data->>'indoor_humidity')::NUMERIC,
    COALESCE(p_submission_data->>'timezone', v_site_timezone)
  )
  RETURNING submission_id INTO v_submission_id;
  
  -- Create conditionally null petri observations from templates
  IF p_petri_templates IS NOT NULL AND jsonb_array_length(p_petri_templates) > 0 THEN
    v_petri_count := jsonb_array_length(p_petri_templates);
    
    FOR i IN 0..(v_petri_count-1) LOOP
      v_petri_template := p_petri_templates->i;
      
      INSERT INTO petri_observations (
        submission_id,
        site_id,
        petri_code,
        image_url,
        plant_type,
        fungicide_used,
        surrounding_water_schedule,
        placement,
        placement_dynamics,
        notes,
        lastupdated_by,
        last_updated_by_user_id
      )
      VALUES (
        v_submission_id,
        p_site_id,
        v_petri_template->>'petri_code',
        NULL, -- Image will be added later
        COALESCE(
          (v_petri_template->>'plant_type')::plant_type_enum, 
          'Other Fresh Perishable'::plant_type_enum
        ),
        (v_petri_template->>'fungicide_used')::fungicide_used_enum,
        (v_petri_template->>'surrounding_water_schedule')::water_schedule_enum,
        (v_petri_template->>'placement')::petri_placement_enum,
        (v_petri_template->>'placement_dynamics')::petri_placement_dynamics_enum,
        v_petri_template->>'notes',
        auth.uid(),
        auth.uid()
      );
    END LOOP;
  END IF;
  
  -- Create conditionally null gasifier observations from templates
  IF p_gasifier_templates IS NOT NULL AND jsonb_array_length(p_gasifier_templates) > 0 THEN
    v_gasifier_count := jsonb_array_length(p_gasifier_templates);
    
    FOR i IN 0..(v_gasifier_count-1) LOOP
      v_gasifier_template := p_gasifier_templates->i;
      
      INSERT INTO gasifier_observations (
        submission_id,
        site_id,
        gasifier_code,
        image_url,
        chemical_type,
        measure,
        anomaly,
        placement_height,
        directional_placement,
        placement_strategy,
        notes,
        lastupdated_by,
        last_updated_by_user_id
      )
      VALUES (
        v_submission_id,
        p_site_id,
        v_gasifier_template->>'gasifier_code',
        NULL, -- Image will be added later
        (v_gasifier_template->>'chemical_type')::chemical_type_enum,
        (v_gasifier_template->>'measure')::NUMERIC,
        COALESCE((v_gasifier_template->>'anomaly')::BOOLEAN, FALSE),
        (v_gasifier_template->>'placement_height')::placement_height_enum,
        (v_gasifier_template->>'directional_placement')::directional_placement_enum,
        (v_gasifier_template->>'placement_strategy')::placement_strategy_enum,
        v_gasifier_template->>'notes',
        auth.uid(),
        auth.uid()
      );
    END LOOP;
  END IF;
  
  -- Create the submission session
  INSERT INTO submission_sessions (
    submission_id,
    site_id,
    program_id,
    opened_by_user_id
  )
  VALUES (
    v_submission_id,
    p_site_id,
    p_program_id,
    auth.uid()
  )
  RETURNING session_id INTO v_session_id;
  
  -- Update the session activity to calculate percentage complete
  v_result := update_submission_session_activity(v_session_id);
  
  -- Return both the submission and session IDs
  RETURN jsonb_build_object(
    'success', TRUE,
    'submission_id', v_submission_id,
    'session_id', v_session_id,
    'session', v_result
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Clean up on failure
    IF v_submission_id IS NOT NULL THEN
      -- This will cascade to delete related observations
      DELETE FROM submissions WHERE submission_id = v_submission_id;
    END IF;
    
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$;

-- Create function to complete a submission session
CREATE OR REPLACE FUNCTION complete_submission_session(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_submission_id UUID;
  v_site_id UUID;
  v_program_id UUID;
  v_opened_by_user_id UUID;
  v_current_status session_status_enum;
BEGIN
  -- Get session details
  SELECT 
    submission_id, 
    site_id, 
    program_id, 
    opened_by_user_id,
    session_status
  INTO 
    v_submission_id, 
    v_site_id, 
    v_program_id, 
    v_opened_by_user_id,
    v_current_status
  FROM submission_sessions
  WHERE session_id = p_session_id;
  
  -- Check if session exists
  IF v_submission_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Session not found'
    );
  END IF;
  
  -- Check if session can be completed (not already Completed, Cancelled, or Expired)
  IF v_current_status IN ('Completed', 'Cancelled', 'Expired') THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Session cannot be completed: ' || v_current_status
    );
  END IF;
  
  -- Verify user permissions (must be opened_by_user_id or in escalated_to_user_ids)
  IF v_opened_by_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM submission_sessions
    WHERE session_id = p_session_id
    AND escalated_to_user_ids @> ARRAY[auth.uid()]
  ) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'You do not have permission to complete this session'
    );
  END IF;
  
  -- Update session to Completed
  UPDATE submission_sessions
  SET 
    session_status = 'Completed',
    completion_time = now(),
    completed_by_user_id = auth.uid(),
    last_activity_time = now(),
    percentage_complete = 100.00
  WHERE session_id = p_session_id
  RETURNING to_jsonb(submission_sessions.*) INTO v_result;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Session completed successfully',
    'session', v_result
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$;

-- Create function to cancel a submission session
CREATE OR REPLACE FUNCTION cancel_submission_session(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_submission_id UUID;
  v_opened_by_user_id UUID;
  v_current_status session_status_enum;
BEGIN
  -- Get session details
  SELECT 
    submission_id, 
    opened_by_user_id,
    session_status
  INTO 
    v_submission_id, 
    v_opened_by_user_id,
    v_current_status
  FROM submission_sessions
  WHERE session_id = p_session_id;
  
  -- Check if session exists
  IF v_submission_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Session not found'
    );
  END IF;
  
  -- Check if session can be cancelled (not already Completed, Cancelled, or Expired)
  IF v_current_status IN ('Completed', 'Cancelled', 'Expired') THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Session cannot be cancelled: ' || v_current_status
    );
  END IF;
  
  -- Verify user permissions (must be opened_by_user_id or in escalated_to_user_ids)
  IF v_opened_by_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM submission_sessions
    WHERE session_id = p_session_id
    AND escalated_to_user_ids @> ARRAY[auth.uid()]
  ) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'You do not have permission to cancel this session'
    );
  END IF;
  
  -- Update session to Cancelled
  UPDATE submission_sessions
  SET 
    session_status = 'Cancelled',
    last_activity_time = now()
  WHERE session_id = p_session_id
  RETURNING to_jsonb(submission_sessions.*) INTO v_result;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Session cancelled successfully',
    'session', v_result
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$;

-- Create function to share/escalate a submission session
CREATE OR REPLACE FUNCTION share_submission_session(
  p_session_id UUID,
  p_user_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_submission_id UUID;
  v_opened_by_user_id UUID;
  v_current_status session_status_enum;
  v_current_escalated_ids UUID[];
  v_updated_escalated_ids UUID[];
BEGIN
  -- Get session details
  SELECT 
    submission_id, 
    opened_by_user_id,
    session_status,
    escalated_to_user_ids
  INTO 
    v_submission_id, 
    v_opened_by_user_id,
    v_current_status,
    v_current_escalated_ids
  FROM submission_sessions
  WHERE session_id = p_session_id;
  
  -- Check if session exists
  IF v_submission_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Session not found'
    );
  END IF;
  
  -- Check if session can be shared (not Cancelled or Expired)
  IF v_current_status IN ('Cancelled', 'Expired') THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Session cannot be shared: ' || v_current_status
    );
  END IF;
  
  -- Verify user permissions (must be opened_by_user_id or in escalated_to_user_ids)
  IF v_opened_by_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM submission_sessions
    WHERE session_id = p_session_id
    AND escalated_to_user_ids @> ARRAY[auth.uid()]
  ) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'You do not have permission to share this session'
    );
  END IF;
  
  -- Create updated escalated_to_user_ids array (combine existing and new, remove duplicates)
  IF v_current_escalated_ids IS NULL THEN
    v_updated_escalated_ids := p_user_ids;
  ELSE
    -- Combine existing and new user IDs, removing duplicates
    WITH combined_ids AS (
      SELECT DISTINCT unnest(v_current_escalated_ids || p_user_ids) AS user_id
    )
    SELECT array_agg(user_id) INTO v_updated_escalated_ids
    FROM combined_ids;
  END IF;
  
  -- Update session
  UPDATE submission_sessions
  SET 
    escalated_to_user_ids = v_updated_escalated_ids,
    session_status = CASE 
      WHEN v_current_status = 'Opened' OR v_current_status = 'Working' THEN 'Escalated'::session_status_enum
      ELSE v_current_status
    END,
    last_activity_time = now()
  WHERE session_id = p_session_id
  RETURNING to_jsonb(submission_sessions.*) INTO v_result;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Session shared successfully',
    'session', v_result
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$;

-- Create function to get active sessions for current user
CREATE OR REPLACE FUNCTION get_active_sessions()
RETURNS TABLE (
  session_id UUID,
  submission_id UUID,
  site_id UUID,
  site_name VARCHAR,
  program_id UUID,
  program_name VARCHAR,
  opened_by_user_id UUID,
  opened_by_user_email TEXT,
  session_start_time TIMESTAMPTZ,
  last_activity_time TIMESTAMPTZ,
  session_status TEXT,
  percentage_complete NUMERIC(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ss.session_id,
    ss.submission_id,
    ss.site_id,
    s.name AS site_name,
    ss.program_id,
    p.name AS program_name,
    ss.opened_by_user_id,
    u.email AS opened_by_user_email,
    ss.session_start_time,
    ss.last_activity_time,
    ss.session_status::TEXT,
    ss.percentage_complete
  FROM 
    submission_sessions ss
    JOIN sites s ON ss.site_id = s.site_id
    JOIN pilot_programs p ON ss.program_id = p.program_id
    JOIN users u ON ss.opened_by_user_id = u.id
  WHERE 
    -- Sessions opened by the current user
    ss.opened_by_user_id = auth.uid()
    OR
    -- Sessions escalated to the current user
    ss.escalated_to_user_ids @> ARRAY[auth.uid()]
    -- Only show active sessions
    AND ss.session_status NOT IN ('Completed', 'Cancelled', 'Expired')
  ORDER BY
    ss.last_activity_time DESC;
END;
$$;

-- Create function to expire old sessions (for cron job)
CREATE OR REPLACE FUNCTION expire_incomplete_sessions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count INTEGER;
  result JSONB;
BEGIN
  -- Update sessions that are not Completed or Cancelled and are older than the day cutoff
  WITH updated_sessions AS (
    UPDATE submission_sessions
    SET 
      session_status = 'Expired',
      last_activity_time = now()
    WHERE 
      session_status NOT IN ('Completed', 'Cancelled', 'Expired')
      -- The cutoff time is 11:59 PM of the session start day
      -- This is a simplified check - in production you'd use the site's timezone
      AND session_start_time < date_trunc('day', now()) + interval '1 day' - interval '1 minute'
    RETURNING session_id
  )
  SELECT COUNT(*) INTO affected_count FROM updated_sessions;
  
  result := jsonb_build_object(
    'success', TRUE,
    'expired_sessions_count', affected_count,
    'timestamp', now()
  );
  
  RETURN result;
END;
$$;

-- Create function to clean up incomplete observations (for cron job)
CREATE OR REPLACE FUNCTION cleanup_incomplete_observations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  petri_count INTEGER;
  gasifier_count INTEGER;
  result JSONB;
BEGIN
  -- Delete petri observations with null images for expired sessions
  WITH expired_sessions AS (
    SELECT submission_id
    FROM submission_sessions
    WHERE session_status = 'Expired'
  ),
  deleted_petris AS (
    DELETE FROM petri_observations
    WHERE 
      submission_id IN (SELECT submission_id FROM expired_sessions)
      AND image_url IS NULL
    RETURNING observation_id
  )
  SELECT COUNT(*) INTO petri_count FROM deleted_petris;
  
  -- Delete gasifier observations with null images for expired sessions
  WITH expired_sessions AS (
    SELECT submission_id
    FROM submission_sessions
    WHERE session_status = 'Expired'
  ),
  deleted_gasifiers AS (
    DELETE FROM gasifier_observations
    WHERE 
      submission_id IN (SELECT submission_id FROM expired_sessions)
      AND image_url IS NULL
    RETURNING observation_id
  )
  SELECT COUNT(*) INTO gasifier_count FROM deleted_gasifiers;
  
  result := jsonb_build_object(
    'success', TRUE,
    'deleted_petri_count', petri_count,
    'deleted_gasifier_count', gasifier_count,
    'timestamp', now()
  );
  
  RETURN result;
END;
$$;

-- Create RLS policies for submission_sessions
ALTER TABLE submission_sessions ENABLE ROW LEVEL SECURITY;

-- Policy for selecting sessions (current user can see their own sessions and ones escalated to them)
CREATE POLICY "Users can see their own sessions and escalated sessions"
ON submission_sessions
FOR SELECT
USING (
  opened_by_user_id = auth.uid()
  OR escalated_to_user_ids @> ARRAY[auth.uid()]
);

-- Policy for inserting sessions (any authenticated user can create a session)
CREATE POLICY "Users can create sessions"
ON submission_sessions
FOR INSERT
WITH CHECK (opened_by_user_id = auth.uid());

-- Policy for updating sessions (current user can update their own sessions and ones escalated to them)
CREATE POLICY "Users can update their own sessions and escalated sessions"
ON submission_sessions
FOR UPDATE
USING (
  opened_by_user_id = auth.uid()
  OR escalated_to_user_ids @> ARRAY[auth.uid()]
);

-- Policy for deleting sessions (only the creator can delete)
CREATE POLICY "Users can delete their own sessions"
ON submission_sessions
FOR DELETE
USING (opened_by_user_id = auth.uid());

-- Add history event types for session events
ALTER TYPE history_event_type_enum ADD VALUE IF NOT EXISTS 'SessionCreation';
ALTER TYPE history_event_type_enum ADD VALUE IF NOT EXISTS 'SessionUpdate';
ALTER TYPE history_event_type_enum ADD VALUE IF NOT EXISTS 'SessionCompletion';
ALTER TYPE history_event_type_enum ADD VALUE IF NOT EXISTS 'SessionCancellation';
ALTER TYPE history_event_type_enum ADD VALUE IF NOT EXISTS 'SessionExpiration';
ALTER TYPE history_event_type_enum ADD VALUE IF NOT EXISTS 'SessionEscalation';

-- Add comments for documentation
COMMENT ON TABLE submission_sessions IS 'Tracks the lifecycle of submission data entry sessions';
COMMENT ON COLUMN submission_sessions.session_id IS 'Primary key for the session';
COMMENT ON COLUMN submission_sessions.submission_id IS 'The submission being edited in this session';
COMMENT ON COLUMN submission_sessions.site_id IS 'The site this submission is for';
COMMENT ON COLUMN submission_sessions.program_id IS 'The program this submission belongs to';
COMMENT ON COLUMN submission_sessions.opened_by_user_id IS 'The user who started this session';
COMMENT ON COLUMN submission_sessions.session_start_time IS 'When the session was started';
COMMENT ON COLUMN submission_sessions.last_activity_time IS 'When the session was last updated';
COMMENT ON COLUMN submission_sessions.session_status IS 'Current status of the session';
COMMENT ON COLUMN submission_sessions.completion_time IS 'When the session was marked as completed';
COMMENT ON COLUMN submission_sessions.completed_by_user_id IS 'The user who completed this session';
COMMENT ON COLUMN submission_sessions.percentage_complete IS 'Percentage of required fields that have been filled';
COMMENT ON COLUMN submission_sessions.valid_petris_logged IS 'Number of petri observations with valid data';
COMMENT ON COLUMN submission_sessions.valid_gasifiers_logged IS 'Number of gasifier observations with valid data';
COMMENT ON COLUMN submission_sessions.escalated_to_user_ids IS 'Users who have been granted access to this session';

COMMENT ON COLUMN sites.state IS 'State/province of the site location';
COMMENT ON COLUMN sites.country IS 'Country of the site location';
COMMENT ON COLUMN sites.timezone IS 'Timezone of the site location';

COMMENT ON COLUMN submissions.submission_timezone IS 'Timezone at the time of submission';

COMMENT ON COLUMN petri_observations.last_updated_by_user_id IS 'User who last updated this observation';
COMMENT ON COLUMN petri_observations.last_edit_time IS 'When this observation was last updated';

COMMENT ON COLUMN gasifier_observations.last_updated_by_user_id IS 'User who last updated this observation';
COMMENT ON COLUMN gasifier_observations.last_edit_time IS 'When this observation was last updated';

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION calculate_session_percentage_complete(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_submission_session_activity(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION create_submission_session(UUID, UUID, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_submission_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_submission_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION share_submission_session(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION expire_incomplete_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_incomplete_observations() TO authenticated;