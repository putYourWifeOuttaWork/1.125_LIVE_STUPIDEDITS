/*
  # Update get_active_sessions_with_details Function
  
  1. Changes
    - Updates function to include unclaimed sessions
    - Adds is_unclaimed flag to identify available sessions
    - Ensures proper filtering to show only relevant unclaimed sessions
    
  2. Purpose
    - Provides a single function to fetch both active and unclaimed sessions
    - Enables the frontend to display both session types appropriately
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS get_active_sessions_with_details();

-- Create an improved version that includes unclaimed sessions
CREATE OR REPLACE FUNCTION get_active_sessions_with_details()
RETURNS TABLE (
  session_id UUID,
  submission_id UUID,
  site_id UUID,
  site_name TEXT,
  program_id UUID,
  program_name TEXT,
  opened_by_user_id UUID,
  opened_by_user_email TEXT,
  opened_by_user_name TEXT,
  session_start_time TIMESTAMPTZ,
  last_activity_time TIMESTAMPTZ,
  session_status TEXT,
  percentage_complete NUMERIC,
  global_submission_id BIGINT,
  escalated_to_user_ids UUID[],
  is_unclaimed BOOLEAN
) LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return claimed (active) sessions first
  RETURN QUERY
  SELECT 
    ss.session_id,
    ss.submission_id,
    ss.site_id,
    s.name::TEXT AS site_name,
    ss.program_id,
    p.name::TEXT AS program_name,
    ss.opened_by_user_id,
    u.email AS opened_by_user_email,
    u.full_name AS opened_by_user_name,
    ss.session_start_time,
    ss.last_activity_time,
    ss.session_status::TEXT,
    ss.percentage_complete,
    sub.global_submission_id,
    ss.escalated_to_user_ids,
    FALSE AS is_unclaimed  -- These are claimed sessions
  FROM 
    submission_sessions ss
    JOIN sites s ON ss.site_id = s.site_id
    JOIN pilot_programs p ON ss.program_id = p.program_id
    JOIN users u ON ss.opened_by_user_id = u.id
    JOIN submissions sub ON ss.submission_id = sub.submission_id
  WHERE 
    -- Only show active sessions (not Completed, Cancelled, or any Expired status)
    ss.session_status NOT IN ('Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete')
    AND ss.opened_by_user_id IS NOT NULL  -- Only claimed sessions
    AND
    (
      -- Sessions opened by the current user
      ss.opened_by_user_id = auth.uid()
      OR
      -- Sessions escalated to the current user
      ss.escalated_to_user_ids @> ARRAY[auth.uid()]
    )
  
  UNION ALL
  
  -- Then return unclaimed sessions (opened_by_user_id IS NULL)
  SELECT 
    ss.session_id,
    ss.submission_id,
    ss.site_id,
    s.name::TEXT AS site_name,
    ss.program_id,
    p.name::TEXT AS program_name,
    ss.opened_by_user_id,
    NULL AS opened_by_user_email,  -- No user email for unclaimed sessions
    NULL AS opened_by_user_name,   -- No user name for unclaimed sessions
    ss.session_start_time,
    ss.last_activity_time,
    ss.session_status::TEXT,
    ss.percentage_complete,
    sub.global_submission_id,
    ss.escalated_to_user_ids,
    TRUE AS is_unclaimed  -- These are unclaimed sessions
  FROM 
    submission_sessions ss
    JOIN sites s ON ss.site_id = s.site_id
    JOIN pilot_programs p ON ss.program_id = p.program_id
    JOIN submissions sub ON ss.submission_id = sub.submission_id
  WHERE 
    ss.session_status = 'Opened'  -- Only Opened status for unclaimed
    AND ss.opened_by_user_id IS NULL  -- Must be unclaimed
    AND ss.program_id IN (  -- User must have access to the program
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
      AND role != 'ReadOnly'  -- User must have write access to claim
    )
    AND DATE(ss.session_start_time) = CURRENT_DATE  -- Only show today's unclaimed sessions
  
  ORDER BY
    last_activity_time DESC;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_active_sessions_with_details() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_active_sessions_with_details IS 'Returns active sessions with related details including global_submission_id and a flag indicating if the session is unclaimed. Returns both user''s own sessions and unclaimed sessions they can claim.';