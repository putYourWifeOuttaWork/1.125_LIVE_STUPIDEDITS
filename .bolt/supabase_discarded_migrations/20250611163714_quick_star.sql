/*
  # Fix Cancel Session Functionality
  
  1. Changes
    - Updates cancel_submission_session function to properly count deleted observations
    - Uses GET DIAGNOSTICS to track row counts instead of RETURNING clause
    - Fixes the "aggregate functions are not allowed in RETURNING" error
    
  2. Purpose
    - Ensures proper operation when a session is cancelled
    - Maintains tracking of how many observations were deleted
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS cancel_submission_session(UUID);

-- Create an improved version that correctly counts deleted rows
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
  v_petri_count INTEGER;
  v_gasifier_count INTEGER;
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
  
  -- Delete petri observations for this submission
  DELETE FROM petri_observations
  WHERE submission_id = v_submission_id;
  
  -- Use GET DIAGNOSTICS to get count of deleted rows
  GET DIAGNOSTICS v_petri_count = ROW_COUNT;
  
  -- Delete gasifier observations for this submission
  DELETE FROM gasifier_observations
  WHERE submission_id = v_submission_id;
  
  -- Use GET DIAGNOSTICS to get count of deleted rows
  GET DIAGNOSTICS v_gasifier_count = ROW_COUNT;
  
  -- Update session to Cancelled
  UPDATE submission_sessions
  SET 
    session_status = 'Cancelled',
    last_activity_time = now()
  WHERE session_id = p_session_id
  RETURNING to_jsonb(submission_sessions.*) INTO v_result;
  
  -- Return success response with counts of deleted observations
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Session cancelled successfully',
    'session', v_result,
    'deleted_petri_count', v_petri_count,
    'deleted_gasifier_count', v_gasifier_count
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
GRANT EXECUTE ON FUNCTION cancel_submission_session(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION cancel_submission_session(UUID) IS 'Cancels a submission session, deletes associated observations, and returns counts of deleted records using GET DIAGNOSTICS';