/*
  # Update Submission Sessions RLS Policies
  
  1. Changes
    - Updates RLS policies to allow access to unclaimed sessions
    - Modifies SELECT, INSERT and UPDATE policies
    - Ensures users can view and claim sessions they have access to
    
  2. Purpose
    - Enables proper security for auto-created unclaimed sessions
    - Allows users to claim sessions for sites they have access to
    - Maintains existing permissions for user's own and escalated sessions
*/

-- Drop existing RLS policies for submission_sessions
DROP POLICY IF EXISTS "Users can see their own sessions and escalated sessions" ON submission_sessions;
DROP POLICY IF EXISTS "Users can create sessions" ON submission_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions and escalated sessions" ON submission_sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON submission_sessions;

-- Recreate policies to handle unclaimed sessions

-- Policy for selecting sessions
CREATE POLICY "Users can see their own sessions, escalated sessions, and unclaimed sessions"
ON submission_sessions
FOR SELECT
USING (
  -- User's own sessions
  opened_by_user_id = auth.uid()
  -- Or sessions escalated/shared with the user
  OR escalated_to_user_ids @> ARRAY[auth.uid()]
  -- Or unclaimed sessions (opened_by_user_id is NULL) for programs/sites user has access to
  OR (
    opened_by_user_id IS NULL
    AND program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
      AND role != 'ReadOnly'
    )
  )
);

-- Policy for inserting sessions
CREATE POLICY "Users can create sessions"
ON submission_sessions
FOR INSERT
WITH CHECK (
  -- Normal session creation (user must be authenticated)
  (opened_by_user_id = auth.uid() OR opened_by_user_id IS NULL)
);

-- Policy for updating sessions
CREATE POLICY "Users can update their own sessions, escalated sessions, and claim unclaimed sessions"
ON submission_sessions
FOR UPDATE
USING (
  -- User's own sessions
  opened_by_user_id = auth.uid()
  -- Or sessions escalated/shared with the user
  OR escalated_to_user_ids @> ARRAY[auth.uid()]
  -- Or unclaimed sessions the user is claiming (opened_by_user_id is NULL)
  OR (
    opened_by_user_id IS NULL
    AND program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
      AND role != 'ReadOnly'
    )
  )
);

-- Policy for deleting sessions
CREATE POLICY "Users can delete their own sessions"
ON submission_sessions
FOR DELETE
USING (opened_by_user_id = auth.uid());

-- Add comments for documentation
COMMENT ON POLICY "Users can see their own sessions, escalated sessions, and unclaimed sessions" ON submission_sessions IS 
  'Allows users to see sessions they own, sessions shared with them, and unclaimed sessions for programs they have access to.';

COMMENT ON POLICY "Users can create sessions" ON submission_sessions IS 
  'Allows users to create sessions, including unclaimed sessions when auto-creating.';

COMMENT ON POLICY "Users can update their own sessions, escalated sessions, and claim unclaimed sessions" ON submission_sessions IS 
  'Allows users to update their own sessions, sessions shared with them, and claim unclaimed sessions.';

COMMENT ON POLICY "Users can delete their own sessions" ON submission_sessions IS 
  'Allows users to delete only sessions they created/own.';