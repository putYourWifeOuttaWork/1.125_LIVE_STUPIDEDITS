/*
  # Fix ambiguous program_id column reference
  
  1. Changes
    - Fixes the "column reference program_id is ambiguous" error
    - Creates a new get_recent_submissions function with fully qualified column references
    - Uses careful approach to check for and drop existing functions to avoid naming conflicts
    
  2. Reason for Change
    - The existing query was failing because multiple tables had columns named program_id
    - This resulted in a database error when trying to use the function in the application
*/

-- First, use a DO block to safely check for and drop any existing function
DO $$
DECLARE
    func_exists boolean;
BEGIN
    -- Check if any function with this name exists
    SELECT EXISTS(
        SELECT 1 FROM pg_proc WHERE proname = 'get_recent_submissions'
    ) INTO func_exists;
    
    -- If it exists, drop all versions of it
    IF func_exists THEN
        -- This will drop all overloaded versions of the function
        DROP FUNCTION IF EXISTS get_recent_submissions(integer);
        DROP FUNCTION IF EXISTS get_recent_submissions(integer, uuid, uuid);
        DROP FUNCTION IF EXISTS get_recent_submissions();
    END IF;
END
$$;

-- Create a new function with a fresh name to avoid conflicts
CREATE OR REPLACE FUNCTION get_recent_submissions_v2(limit_param integer)
RETURNS TABLE (
  submission_id uuid,
  site_id uuid,
  site_name varchar,
  program_id uuid,
  program_name varchar,
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
  WHERE
    (
      -- Either user has direct access to the program
      s.program_id IN (
        SELECT program_id FROM pilot_program_users WHERE user_id = auth.uid()
      )
      -- Or user's company has access to the program
      OR s.program_id IN (
        SELECT pp2.program_id FROM pilot_programs pp2
        WHERE pp2.company_id IN (
          SELECT company_id FROM users WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      )
    )
  ORDER BY 
    s.created_at DESC
  LIMIT 
    limit_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_recent_submissions_v2(integer) TO authenticated;

COMMENT ON FUNCTION get_recent_submissions_v2(integer) IS 'Returns a list of recent submissions with site and program names and petri observation counts';