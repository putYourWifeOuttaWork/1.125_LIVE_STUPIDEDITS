/*
  # Add Shared Status to History Event Types
  
  1. Changes
    - Adds 'SessionSharing' to history_event_type_enum
    - Ensures all session status changes are properly tracked
    
  2. Purpose
    - Enables tracking of session sharing events in the audit log
    - Completes the audit trail for all session lifecycle events
*/

-- Add new value to history_event_type_enum
DO $$
BEGIN
  -- Add 'SessionSharing' value if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'SessionSharing' 
    AND enumtypid = (
      SELECT oid FROM pg_type WHERE typname = 'history_event_type_enum'
    )
  ) THEN
    ALTER TYPE history_event_type_enum ADD VALUE 'SessionSharing';
  END IF;
END
$$;

-- Update share_submission_session function to log history events
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
  v_history_type history_event_type_enum;
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
  -- SIMPLIFIED LOGIC: Only set to 'Escalated' if action is explicitly 'escalate'
  IF p_action_type = 'escalate' THEN
    v_new_status := 'Escalated';
    v_history_type := 'SessionEscalation';
  -- If action is 'share', always set to 'Shared' unless already 'Escalated'
  ELSIF p_action_type = 'share' THEN
    -- If already escalated, keep it escalated
    IF v_current_status = 'Escalated' THEN
      v_new_status := 'Escalated';
      v_history_type := 'SessionSharing';
    -- Otherwise, set to 'Shared'
    ELSE
      v_new_status := 'Shared';
      v_history_type := 'SessionSharing';
    END IF;
  -- Otherwise, maintain current status
  ELSE
    v_new_status := v_current_status;
    v_history_type := 'SessionSharing';
  END IF;
  
  -- Update session
  UPDATE submission_sessions
  SET 
    escalated_to_user_ids = v_updated_escalated_ids,
    session_status = v_new_status,
    last_activity_time = now()
  WHERE session_id = p_session_id
  RETURNING to_jsonb(submission_sessions.*) INTO v_result;
  
  -- Log the sharing/escalation event to history
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
    v_history_type,
    p_session_id,
    'submission_session',
    v_program_id,
    auth.uid(),
    (SELECT email FROM users WHERE id = auth.uid()),
    (SELECT company FROM users WHERE id = auth.uid()),
    (SELECT role::TEXT FROM pilot_program_users WHERE user_id = auth.uid() AND program_id = v_program_id LIMIT 1),
    jsonb_build_object(
      'session_status', v_current_status,
      'escalated_to_user_ids', v_current_escalated_ids
    ),
    jsonb_build_object(
      'session_status', v_new_status,
      'escalated_to_user_ids', v_updated_escalated_ids,
      'action_type', p_action_type
    )
  );
  
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

-- Add comment for documentation
COMMENT ON FUNCTION share_submission_session IS 'Shares or escalates a submission session based on the provided action_type. "share" action always sets status to Shared (unless already Escalated). "escalate" action always sets status to Escalated. Logs the action to history.';