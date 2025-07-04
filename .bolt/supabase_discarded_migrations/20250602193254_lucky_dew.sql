/*
  # Fix type mismatch in get_recent_submissions function
  
  1. Changes
    - Updates the get_recent_submissions function to properly handle type conversion
    - Explicitly casts character varying columns to text in the function's SELECT statement
    - Ensures the function's return type matches the actual returned data types
  
  2. Technical Details
    - The original error was: "Returned type character varying(100) does not match expected type text in column 3"
    - This fix ensures proper type casting for all character varying columns that might be causing the mismatch
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS get_recent_submissions;

-- Recreate the function with proper type handling
CREATE OR REPLACE FUNCTION get_recent_submissions(limit_count integer DEFAULT 5)
RETURNS TABLE (
  submission_id uuid,
  site_id uuid,
  site_name text,
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
    sites.name::text as site_name,
    s.program_name::text,
    s.temperature,
    s.humidity,
    s.created_at,
    COUNT(po.observation_id)::bigint as petri_count
  FROM 
    submissions s
  JOIN 
    sites ON s.site_id = sites.site_id
  LEFT JOIN 
    petri_observations po ON s.submission_id = po.submission_id
  WHERE 
    s.site_id IN (
      SELECT site_id 
      FROM sites 
      WHERE program_id IN (
        SELECT program_id 
        FROM pilot_program_users 
        WHERE user_id = auth.uid()
      )
    )
  GROUP BY 
    s.submission_id, s.site_id, sites.name, s.program_name, s.temperature, s.humidity, s.created_at
  ORDER BY 
    s.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;