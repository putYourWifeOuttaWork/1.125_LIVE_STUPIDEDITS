/*
  # Fix Session Sharing and Escalation Logic
  
  1. Changes
    - Update share_submission_session function to accept an action_type parameter
    - Add explicit logic to differentiate between 'share' and 'escalate' actions
    - Ensure 'Escalated' status is only set when explicitly requested or when sharing with an admin
    - Add 'Shared' status support for general user sharing
    
  2. Purpose
    - Resolves issue where all sharing actions incorrectly set status to 'Escalated'
    - Maintains proper workflow state transitions
    - Prevents unwanted status changes when sharing with non-admin users
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS share_submission_session(UUID, UUID[]);

-- Create an improved version that respects action type
CREATE OR REPLACE FUNCTION share_submission_session(
  p_session_id UUID,
  p_user_ids UUID[],
  p_action_type TEXT DEFAULT 'share'  -- New parameter, defaults to 'share' for backward compatibility
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
  v_new_status session_status_enum;
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
  
  -- Determine the new status based on action type and current status
  -- If current status is already 'Escalated', preserve it regardless of action
  IF v_current_status = 'Escalated' THEN
    v_new_status := 'Escalated';
  -- If action is explicitly 'escalate', set to 'Escalated'
  ELSIF p_action_type = 'escalate' THEN
    v_new_status := 'Escalated';
  -- If action is 'share' and we're sharing with an admin, set to 'Escalated'
  ELSIF p_action_type = 'share' AND (v_has_company_admin OR v_has_program_admin) THEN
    v_new_status := 'Escalated';
  -- If action is 'share' and current status is 'Opened' or 'Working', set to 'Shared'
  ELSIF p_action_type = 'share' AND v_current_status IN ('Opened', 'Working') THEN
    v_new_status := 'Shared';
  -- Otherwise, maintain current status
  ELSE
    v_new_status := v_current_status;
  END IF;
  
  -- Update session
  UPDATE submission_sessions
  SET 
    escalated_to_user_ids = v_updated_escalated_ids,
    session_status = v_new_status,
    last_activity_time = now()
  WHERE session_id = p_session_id
  RETURNING to_jsonb(submission_sessions.*) INTO v_result;
  
  -- Return success response with status information
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', CASE
      WHEN p_action_type = 'escalate' THEN 'Session escalated successfully'
      ELSE 'Session shared successfully'
    END,
    'session', v_result,
    'action', p_action_type,
    'new_status', v_new_status
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION share_submission_session(UUID, UUID[], TEXT) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION share_submission_session IS 'Shares or escalates a submission session based on the provided action_type. "share" action sets status to Shared unless sharing with an admin. "escalate" action always sets status to Escalated.';