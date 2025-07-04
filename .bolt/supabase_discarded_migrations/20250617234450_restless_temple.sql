/*
  # Fix Ambiguous Column Reference in get_active_sessions_with_details

  1. Changes
     - Fixes the ambiguous column reference "program_id" by explicitly qualifying it with the table name
     - Ensures all column references are properly qualified to avoid ambiguity
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS public.get_active_sessions_with_details();

-- Create the updated function with explicit column qualifications
CREATE OR REPLACE FUNCTION public.get_active_sessions_with_details()
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH user_sessions AS (
    SELECT 
      ss.session_id,
      ss.submission_id,
      ss.site_id,
      ss.program_id,
      ss.opened_by_user_id,
      ss.session_start_time,
      ss.last_activity_time,
      ss.session_status,
      ss.percentage_complete,
      ss.escalated_to_user_ids,
      ss.valid_petris_logged,
      ss.valid_gasifiers_logged,
      s.name AS site_name,
      p.name AS program_name,
      sub.global_submission_id,
      u.email AS opened_by_user_email,
      u.full_name AS opened_by_user_name,
      CASE WHEN ss.opened_by_user_id IS NULL THEN true ELSE false END AS is_unclaimed
    FROM 
      submission_sessions ss
      JOIN sites s ON ss.site_id = s.site_id
      JOIN pilot_programs p ON ss.program_id = p.program_id
      JOIN submissions sub ON ss.submission_id = sub.submission_id
      LEFT JOIN users u ON ss.opened_by_user_id = u.id
    WHERE 
      (
        -- Sessions opened by the current user
        ss.opened_by_user_id = auth.uid() 
        OR 
        -- Sessions shared with the current user
        ss.escalated_to_user_ids @> ARRAY[auth.uid()]
        OR
        -- Unclaimed sessions for programs where the user has access
        (
          ss.opened_by_user_id IS NULL 
          AND ss.program_id IN (
            SELECT ppu.program_id
            FROM pilot_program_users ppu
            WHERE ppu.user_id = auth.uid() AND ppu.role <> 'ReadOnly'
          )
        )
        OR
        -- Unclaimed sessions for programs in the user's company (for company admins)
        (
          ss.opened_by_user_id IS NULL 
          AND ss.program_id IN (
            SELECT pp.program_id
            FROM pilot_programs pp
            JOIN users u ON pp.company_id = u.company_id
            WHERE u.id = auth.uid() AND u.is_company_admin = true
          )
        )
      )
      -- Only include active sessions (not completed, cancelled, or expired)
      AND ss.session_status NOT IN ('Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete')
  )
  SELECT 
    json_build_object(
      'session_id', us.session_id,
      'submission_id', us.submission_id,
      'site_id', us.site_id,
      'site_name', us.site_name,
      'program_id', us.program_id,
      'program_name', us.program_name,
      'opened_by_user_id', us.opened_by_user_id,
      'opened_by_user_email', us.opened_by_user_email,
      'opened_by_user_name', us.opened_by_user_name,
      'session_start_time', us.session_start_time,
      'last_activity_time', us.last_activity_time,
      'session_status', us.session_status,
      'percentage_complete', us.percentage_complete,
      'valid_petris_logged', us.valid_petris_logged,
      'valid_gasifiers_logged', us.valid_gasifiers_logged,
      'global_submission_id', us.global_submission_id,
      'escalated_to_user_ids', us.escalated_to_user_ids,
      'is_unclaimed', us.is_unclaimed
    )
  FROM user_sessions us
  ORDER BY 
    CASE WHEN us.is_unclaimed THEN 0 ELSE 1 END,  -- Unclaimed sessions first
    us.last_activity_time DESC;                   -- Then by most recent activity
END;
$$;