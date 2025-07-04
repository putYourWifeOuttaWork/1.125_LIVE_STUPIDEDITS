-- Drop the existing function first
DROP FUNCTION IF EXISTS get_recent_submissions(integer);

-- Create a new version of the function with additional parameters
CREATE OR REPLACE FUNCTION get_recent_submissions(
  limit_param integer DEFAULT 5,
  program_id_param uuid DEFAULT NULL,
  site_id_param uuid DEFAULT NULL
)
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
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.submission_id,
    s.site_id,
    sites.name::text as site_name,
    s.program_id,
    pp.name::text as program_name,
    s.temperature,
    s.humidity,
    s.created_at,
    COALESCE(COUNT(po.observation_id), 0)::bigint as petri_count
  FROM 
    submissions s
  JOIN 
    sites ON s.site_id = sites.site_id
  JOIN 
    pilot_programs pp ON s.program_id = pp.program_id
  LEFT JOIN 
    petri_observations po ON s.submission_id = po.submission_id
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
  GROUP BY 
    s.submission_id, s.site_id, sites.name, s.program_id, pp.name, s.temperature, s.humidity, s.created_at
  ORDER BY 
    s.created_at DESC
  LIMIT 
    limit_param;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_recent_submissions(integer, uuid, uuid) TO authenticated;