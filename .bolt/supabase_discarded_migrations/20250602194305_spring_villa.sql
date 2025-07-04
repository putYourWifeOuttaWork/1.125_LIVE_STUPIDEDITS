/*
  # Fix ambiguous column references in get_recent_submissions function
  
  1. Changes
    - Properly qualifies all column references with table aliases
    - Ensures the function signature is uniquely identified with parameter types
    - Handles existing function with same name but different signature
  
  2. Reason for Change
    - Resolves the "column reference program_id is ambiguous" error
    - Improves query performance and readability
*/

-- First, check if the function exists with the exact signature and drop it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM pg_proc 
    WHERE proname = 'get_recent_submissions' 
    AND pronargs = 1
    AND proargtypes[0] = 'integer'::regtype::oid
  ) THEN
    DROP FUNCTION get_recent_submissions(integer);
  END IF;
END $$;

-- Create a new function with fully qualified column references
CREATE FUNCTION get_recent_submissions(limit_param integer)
RETURNS TABLE (
  submission_id uuid,
  site_id uuid,
  site_name character varying,
  program_id uuid,
  program_name character varying,
  temperature numeric,
  humidity numeric,
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
    COALESCE(
      (SELECT COUNT(*) 
       FROM petri_observations po 
       WHERE po.submission_id = s.submission_id), 
      0
    )::bigint AS petri_count
  FROM 
    submissions s
  JOIN 
    sites ON s.site_id = sites.site_id
  JOIN 
    pilot_programs pp ON s.program_id = pp.program_id
  ORDER BY 
    s.created_at DESC
  LIMIT 
    limit_param;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_recent_submissions(integer) TO authenticated;

COMMENT ON FUNCTION get_recent_submissions(integer) IS 'Returns a list of recent submissions with site and program names and petri observation counts';