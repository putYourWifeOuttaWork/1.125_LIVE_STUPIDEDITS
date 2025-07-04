-- Add escalated_to_user_ids to get_active_sessions_with_details RPC function

-- Drop the existing function to recreate it with the new column
DROP FUNCTION IF EXISTS get_active_sessions_with_details();

-- Create a secure function to get active sessions with all details including global_submission_id and escalated_to_user_ids
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
  escalated_to_user_ids UUID[] -- New column added here
) LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
    ss.escalated_to_user_ids -- Select the new column here
  FROM 
    submission_sessions ss
    JOIN sites s ON ss.site_id = s.site_id
    JOIN pilot_programs p ON ss.program_id = p.program_id
    JOIN users u ON ss.opened_by_user_id = u.id
    JOIN submissions sub ON ss.submission_id = sub.submission_id
  WHERE 
    -- Only show active sessions (not Completed, Cancelled, or any Expired status)
    ss.session_status NOT IN ('Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete')
    AND
    (
      -- Sessions opened by the current user
      ss.opened_by_user_id = auth.uid()
      OR
      -- Sessions escalated to the current user
      ss.escalated_to_user_ids @> ARRAY[auth.uid()]
    )
  ORDER BY
    ss.last_activity_time DESC;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_active_sessions_with_details() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_active_sessions_with_details IS 'Returns active sessions with related details including global_submission_id and escalated_to_user_ids. Handles relationships properly for the current user.';