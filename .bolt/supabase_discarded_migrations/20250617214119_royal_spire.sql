/*
  # Create claim_submission_session Function
  
  1. Changes
    - Creates a new RPC function to claim an unclaimed session
    - Updates the session with the current user as opened_by_user_id
    - Sets session_status to 'Working' when claimed
    
  2. Purpose
    - Allows users to claim unclaimed sessions created by the auto-creation process
    - Properly transitions the session state from 'Opened' to 'Working'
*/

CREATE OR REPLACE FUNCTION claim_submission_session(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_session RECORD;
  v_program_id UUID;
  v_user_has_access BOOLEAN;
BEGIN
  -- Get the session to verify it's unclaimed
  SELECT * INTO v_session
  FROM submission_sessions
  WHERE session_id = p_session_id;
  
  -- Check if session exists
  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Session not found'
    );
  END IF;
  
  -- Store program_id for access check
  v_program_id := v_session.program_id;
  
  -- Check if session is already claimed
  IF v_session.opened_by_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Session is already claimed'
    );
  END IF;
  
  -- Check if session is in a claimable state
  IF v_session.session_status != 'Opened' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Session cannot be claimed: ' || v_session.session_status
    );
  END IF;
  
  -- Check if the user has access to this program with appropriate role
  SELECT EXISTS (
    SELECT 1 FROM pilot_program_users
    WHERE program_id = v_program_id
    AND user_id = auth.uid()
    AND role != 'ReadOnly'
  ) INTO v_user_has_access;
  
  IF NOT v_user_has_access THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'You do not have permission to claim this session'
    );
  END IF;
  
  -- Update the session: claim it and set to Working status
  UPDATE submission_sessions
  SET 
    opened_by_user_id = auth.uid(),
    session_status = 'Working',
    last_activity_time = now()
  WHERE session_id = p_session_id
  RETURNING to_jsonb(submission_sessions.*) INTO v_result;
  
  -- Calculate percentage complete now that the session is claimed
  v_result := update_submission_session_activity(p_session_id);
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Session claimed successfully',
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

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION claim_submission_session(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION claim_submission_session IS 'Claims an unclaimed session by setting the opened_by_user_id to the current user and updating the status to Working.';