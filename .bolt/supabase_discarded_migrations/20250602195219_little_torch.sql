-- First, drop the existing function if it exists
DROP FUNCTION IF EXISTS get_recent_submissions_v2(integer);

-- Create a new function with fully qualified column references and optional parameters
CREATE OR REPLACE FUNCTION get_recent_submissions_v2(
  limit_param integer DEFAULT 10,
  program_id_param uuid DEFAULT NULL,
  site_id_param uuid DEFAULT NULL
)
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
    -- Add filter for specific program or site if provided
    AND (program_id_param IS NULL OR s.program_id = program_id_param)
    AND (site_id_param IS NULL OR s.site_id = site_id_param)
  ORDER BY 
    s.created_at DESC
  LIMIT 
    limit_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_recent_submissions_v2(integer, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION get_recent_submissions_v2(integer, uuid, uuid) IS 'Returns a list of recent submissions with site and program names and petri observation counts';