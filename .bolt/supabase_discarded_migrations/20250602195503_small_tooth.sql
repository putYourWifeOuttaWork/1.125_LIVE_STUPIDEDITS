/*
  # Fix ambiguous program_id reference in get_recent_submissions_v2 function
  
  1. Changes
     - Drops and recreates the `get_recent_submissions_v2` function
     - Qualifies all references to `program_id` with their respective table aliases
     - Ensures proper filtering based on program_id and site_id parameters
  
  2. Issue Fixed
     - Resolves the "column reference 'program_id' is ambiguous" error
     - This error occurred because program_id exists in multiple tables
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS get_recent_submissions_v2;

-- Create the updated function with qualified column references
CREATE OR REPLACE FUNCTION get_recent_submissions_v2(
  limit_param INTEGER,
  program_id_param UUID DEFAULT NULL,
  site_id_param UUID DEFAULT NULL
) 
RETURNS TABLE (
  submission_id UUID,
  site_id UUID,
  site_name VARCHAR,
  program_id UUID,
  program_name VARCHAR,
  temperature NUMERIC,
  humidity NUMERIC,
  created_at TIMESTAMPTZ,
  petri_count BIGINT
) 
LANGUAGE plpgsql
AS $$
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
    COUNT(po.observation_id)::BIGINT AS petri_count
  FROM 
    submissions s
    JOIN sites ON s.site_id = sites.site_id
    JOIN pilot_programs pp ON s.program_id = pp.program_id
    LEFT JOIN petri_observations po ON s.submission_id = po.submission_id
  WHERE 
    (program_id_param IS NULL OR s.program_id = program_id_param)
    AND (site_id_param IS NULL OR s.site_id = site_id_param)
  GROUP BY 
    s.submission_id, s.site_id, sites.name, s.program_id, pp.name, s.temperature, s.humidity, s.created_at
  ORDER BY 
    s.created_at DESC
  LIMIT limit_param;
END;
$$;