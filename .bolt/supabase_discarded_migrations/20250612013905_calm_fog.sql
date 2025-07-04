/*
  # Add New Session Status Values
  
  1. New Enum Values
    - 'Shared' - For sessions shared with non-admin team members
    - 'Expired-Complete' - For expired sessions where all observations were complete
    - 'Expired-Incomplete' - For expired sessions with incomplete observations
    
  2. Purpose
    - Differentiate between escalated sessions (to admins) and shared sessions (to team members)
    - Provide more specific information about expired sessions
    - Reserve 'Escalated' status specifically for sessions shared with site admins
*/

-- Add new values to session_status_enum
DO $$
BEGIN
  -- Add 'Shared' value if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'Shared' 
    AND enumtypid = (
      SELECT oid FROM pg_type WHERE typname = 'session_status_enum'
    )
  ) THEN
    ALTER TYPE session_status_enum ADD VALUE 'Shared';
  END IF;
  
  -- Add 'Expired-Complete' value if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'Expired-Complete' 
    AND enumtypid = (
      SELECT oid FROM pg_type WHERE typname = 'session_status_enum'
    )
  ) THEN
    ALTER TYPE session_status_enum ADD VALUE 'Expired-Complete';
  END IF;
  
  -- Add 'Expired-Incomplete' value if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'Expired-Incomplete' 
    AND enumtypid = (
      SELECT oid FROM pg_type WHERE typname = 'session_status_enum'
    )
  ) THEN
    ALTER TYPE session_status_enum ADD VALUE 'Expired-Incomplete';
  END IF;
END
$$;

-- Update the expire_incomplete_sessions function to use the new enum values
CREATE OR REPLACE FUNCTION expire_incomplete_sessions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  completed_count INTEGER;
  incomplete_count INTEGER;
  result JSONB;
BEGIN
  -- Update completed sessions that are past their expiration time
  WITH completed_sessions AS (
    UPDATE submission_sessions
    SET 
      session_status = 'Expired-Complete',
      last_activity_time = now()
    WHERE 
      session_status NOT IN ('Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete')
      -- The cutoff time is 11:59 PM of the session start day
      AND session_start_time < date_trunc('day', now()) + interval '1 day' - interval '1 minute'
      -- Only mark as Expired-Complete if percentage_complete is 100
      AND percentage_complete = 100
    RETURNING session_id
  )
  SELECT COUNT(*) INTO completed_count FROM completed_sessions;
  
  -- Update incomplete sessions that are past their expiration time
  WITH incomplete_sessions AS (
    UPDATE submission_sessions
    SET 
      session_status = 'Expired-Incomplete',
      last_activity_time = now()
    WHERE 
      session_status NOT IN ('Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete')
      -- The cutoff time is 11:59 PM of the session start day
      AND session_start_time < date_trunc('day', now()) + interval '1 day' - interval '1 minute'
      -- Only mark as Expired-Incomplete if percentage_complete is less than 100
      AND percentage_complete < 100
    RETURNING session_id
  )
  SELECT COUNT(*) INTO incomplete_count FROM incomplete_sessions;
  
  result := jsonb_build_object(
    'success', TRUE,
    'expired_complete_count', completed_count,
    'expired_incomplete_count', incomplete_count,
    'timestamp', now()
  );
  
  RETURN result;
END;
$$;

-- Update the share_submission_session function to use 'Shared' status for non-admin sharing
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
  v_has_company_admin BOOLEAN := FALSE;
  v_has_program_admin BOOLEAN := FALSE;
  v_program_id UUID;
BEGIN
  -- Get session details
  SELECT 
    submission_id, 
    opened_by_user_id,
    session_status,
    escalated_to_user_ids,
    program_id
  INTO 
    v_submission_id, 
    v_opened_by_user_id,
    v_current_status,
    v_current_escalated_ids,
    v_program_id
  FROM submission_sessions
  WHERE session_id = p_session_id;
  
  -- Check if session exists
  IF v_submission_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Session not found');
  END IF;
  
  -- Check if session can be shared (not Cancelled or Expired)
  IF v_current_status IN ('Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete') THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Session cannot be shared: ' || v_current_status);
  END IF;
  
  -- Verify user permissions (must be opened_by_user_id or in escalated_to_user_ids)
  IF v_opened_by_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM submission_sessions
    WHERE session_id = p_session_id
    AND escalated_to_user_ids @> ARRAY[auth.uid()]
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'You do not have permission to share this session');
  END IF;
  
  -- Check if any of the users being shared with are company admins
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = ANY(p_user_ids)
    AND is_company_admin = TRUE
  ) INTO v_has_company_admin;
  
  -- Check if any of the users being shared with are program admins
  SELECT EXISTS (
    SELECT 1 FROM pilot_program_users
    WHERE user_id = ANY(p_user_ids)
    AND program_id = v_program_id
    AND role = 'Admin'
  ) INTO v_has_program_admin;
  
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
    -- Set status based on who we're sharing with
    session_status = CASE 
      -- If sharing with company admin or program admin and status is 'Opened', 'Working', or 'Shared', set to 'Escalated'
      WHEN (v_has_company_admin OR v_has_program_admin) AND v_current_status IN ('Opened', 'Working', 'Shared') 
        THEN 'Escalated'::session_status_enum
      -- If sharing with non-admin users and status is 'Opened' or 'Working', set to 'Shared'
      WHEN NOT (v_has_company_admin OR v_has_program_admin) AND v_current_status IN ('Opened', 'Working')
        THEN 'Shared'::session_status_enum
      -- Otherwise maintain current status
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

-- Create a function to get program admin user_id
CREATE OR REPLACE FUNCTION get_program_admin_user_id(p_program_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_user_id UUID;
  v_company_id UUID;
BEGIN
  -- First try to find a program admin
  SELECT user_id INTO v_admin_user_id
  FROM pilot_program_users
  WHERE program_id = p_program_id
  AND role = 'Admin'
  LIMIT 1;
  
  -- If no program admin found, try to find a company admin
  IF v_admin_user_id IS NULL THEN
    -- Get the company_id for this program
    SELECT company_id INTO v_company_id
    FROM pilot_programs
    WHERE program_id = p_program_id;
    
    -- If we have a company_id, try to find a company admin
    IF v_company_id IS NOT NULL THEN
      SELECT id INTO v_admin_user_id
      FROM users
      WHERE company_id = v_company_id
      AND is_company_admin = TRUE
      LIMIT 1;
    END IF;
  END IF;
  
  RETURN v_admin_user_id;
END;
$$;

-- Create a function to get submission with creator details
CREATE OR REPLACE FUNCTION get_submission_with_creator(submission_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  submission_data JSONB;
  creator_data JSONB;
BEGIN
  -- Get the submission data
  SELECT to_jsonb(s) INTO submission_data
  FROM submissions s
  WHERE s.submission_id = submission_id_param;
  
  IF submission_data IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get creator details if available
  IF submission_data->>'created_by' IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'full_name', u.full_name
    ) INTO creator_data
    FROM users u
    WHERE u.id = (submission_data->>'created_by')::UUID;
    
    -- Add creator details to the submission data
    IF creator_data IS NOT NULL THEN
      submission_data := submission_data || jsonb_build_object('creator', creator_data);
    END IF;
  END IF;
  
  RETURN submission_data;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION expire_incomplete_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION share_submission_session(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_program_admin_user_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_submission_with_creator(UUID) TO authenticated;

-- Update comments for documentation
COMMENT ON FUNCTION expire_incomplete_sessions IS 'Expires sessions using new Expired-Complete and Expired-Incomplete statuses to indicate completion state';
COMMENT ON FUNCTION share_submission_session IS 'Shares a submission session with other users, setting status to Shared or Escalated based on who it is shared with';
COMMENT ON FUNCTION get_program_admin_user_id IS 'Returns the user_id of a program admin or company admin for a given program';
COMMENT ON FUNCTION get_submission_with_creator IS 'Returns submission data enriched with creator details';