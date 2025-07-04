/*
  # Fix ambiguous column reference in get_recent_submissions function
  
  1. Changes
     - Update the get_recent_submissions function to qualify the ambiguous program_id column
     - Explicitly specify which table's program_id column to use in the query
  
  2. Issue Fixed
     - Resolves the "column reference 'program_id' is ambiguous" error
     - Ensures the function returns the correct data with proper table column references
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS get_recent_submissions;

-- Recreate the function with properly qualified column references
CREATE OR REPLACE FUNCTION get_recent_submissions(limit_param integer)
RETURNS TABLE (
  submission_id uuid,
  site_id uuid,
  site_name text,
  program_id uuid,
  program_name text,
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
    si.name as site_name,
    s.program_id,
    p.name as program_name,
    s.temperature,
    s.humidity,
    s.created_at,
    COALESCE(COUNT(po.observation_id), 0)::bigint as petri_count
  FROM 
    submissions s
  JOIN 
    sites si ON s.site_id = si.site_id
  LEFT JOIN 
    pilot_programs p ON s.program_id = p.program_id
  LEFT JOIN 
    petri_observations po ON s.submission_id = po.submission_id
  GROUP BY 
    s.submission_id, si.name, p.name
  ORDER BY 
    s.created_at DESC
  LIMIT limit_param;
END;
$$ LANGUAGE plpgsql;