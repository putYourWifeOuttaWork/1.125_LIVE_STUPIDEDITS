/*
  # Fix ambiguous column reference in get_recent_submissions function

  1. Changes
     - Updates the get_recent_submissions function to properly qualify ambiguous column references
     - Fixes the "column reference 'program_id' is ambiguous" error
     - Ensures proper table aliases for all column references
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS get_recent_submissions(integer);

-- Recreate the function with properly qualified column references
CREATE OR REPLACE FUNCTION get_recent_submissions(limit_param integer)
RETURNS TABLE (
  submission_id uuid,
  site_id uuid,
  site_name character varying(100),
  program_id uuid,
  program_name character varying(100),
  temperature numeric(5,2),
  humidity numeric(5,2),
  created_at timestamptz,
  petri_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.submission_id,
    s.site_id,
    sites.name AS site_name,
    s.program_id,
    pp.name AS program_name,
    s.temperature,
    s.humidity,
    s.created_at,
    COALESCE(petri_counts.count, 0) AS petri_count
  FROM 
    submissions s
  JOIN 
    sites ON s.site_id = sites.site_id
  JOIN 
    pilot_programs pp ON s.program_id = pp.program_id
  LEFT JOIN (
    SELECT 
      po.submission_id, 
      COUNT(*) AS count
    FROM 
      petri_observations po
    GROUP BY 
      po.submission_id
  ) petri_counts ON s.submission_id = petri_counts.submission_id
  ORDER BY 
    s.created_at DESC
  LIMIT limit_param;
END;
$$ LANGUAGE plpgsql;

-- Update permissions for the function
REVOKE ALL ON FUNCTION get_recent_submissions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_recent_submissions(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_submissions(integer) TO service_role;