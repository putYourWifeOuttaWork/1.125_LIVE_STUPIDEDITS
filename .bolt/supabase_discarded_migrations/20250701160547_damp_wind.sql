/*
  # Add New RPC Function for Submissions with Status and Date Filtering
  
  1. New Features
    - Create a function to fetch submissions with session status and date filtering
    - Include options to filter out cancelled and expired submissions
    - Support for date range filtering
    
  2. Purpose
    - Enable more advanced filtering of submission data in the UI
    - Support the "Show All Statuses" toggle feature
    - Enable date range filtering for submissions
*/

-- Create or replace the function for fetching submissions with status and date filtering
CREATE OR REPLACE FUNCTION public.fetch_submissions_with_status(
  p_site_id UUID,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_show_all_statuses BOOLEAN DEFAULT FALSE
)
RETURNS SETOF jsonb AS $$
DECLARE
  v_session_statuses TEXT[];
BEGIN
  -- Define which session statuses to filter out when not showing all statuses
  IF NOT p_show_all_statuses THEN
    v_session_statuses := ARRAY['Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete'];
  ELSE
    v_session_statuses := ARRAY[]::TEXT[];
  END IF;
  
  RETURN QUERY
  WITH submission_counts AS (
    SELECT 
      s.submission_id,
      COUNT(po.observation_id) AS petri_count,
      COUNT(go.observation_id) AS gasifier_count
    FROM 
      submissions s
    LEFT JOIN 
      petri_observations po ON s.submission_id = po.submission_id
    LEFT JOIN 
      gasifier_observations go ON s.submission_id = go.submission_id
    WHERE 
      s.site_id = p_site_id
    GROUP BY 
      s.submission_id
  ),
  session_info AS (
    SELECT
      ss.submission_id,
      ss.session_status,
      ss.last_activity_time,
      ss.opened_by_user_id
    FROM
      submission_sessions ss
  )
  SELECT 
    jsonb_build_object(
      'submission_id', s.submission_id,
      'site_id', s.site_id,
      'program_id', s.program_id,
      'temperature', s.temperature,
      'humidity', s.humidity,
      'airflow', s.airflow,
      'odor_distance', s.odor_distance,
      'weather', s.weather,
      'notes', s.notes,
      'created_by', s.created_by,
      'created_at', s.created_at,
      'updated_at', s.updated_at,
      'program_name', s.program_name,
      'global_submission_id', s.global_submission_id,
      'petri_count', COALESCE(sc.petri_count, 0),
      'gasifier_count', COALESCE(sc.gasifier_count, 0),
      'session_status', si.session_status,
      'last_activity_time', si.last_activity_time,
      'opened_by_user_id', si.opened_by_user_id
    )
  FROM 
    submissions s
  JOIN
    submission_counts sc ON s.submission_id = sc.submission_id
  LEFT JOIN
    session_info si ON s.submission_id = si.submission_id
  WHERE 
    s.site_id = p_site_id
    AND (p_start_date IS NULL OR s.created_at >= p_start_date)
    AND (p_end_date IS NULL OR s.created_at <= p_end_date)
    -- Only filter out certain statuses if p_show_all_statuses is false
    AND (array_length(v_session_statuses, 1) IS NULL 
         OR si.session_status IS NULL
         OR NOT (si.session_status = ANY(v_session_statuses)))
  ORDER BY 
    s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.fetch_submissions_with_status TO authenticated;

-- Add comment to the function
COMMENT ON FUNCTION public.fetch_submissions_with_status IS 'Fetches submissions for a site with date range filtering and optional filtering of cancelled/expired sessions';