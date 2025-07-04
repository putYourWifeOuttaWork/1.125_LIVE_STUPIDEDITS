/*
  # Fix Submission Query and View for Roll-up Counts
  
  1. Changes
    - Creates a view to optimize submission queries with observation counts
    - Updates the RPC function to use the new view for better performance
    - Fixes issues with submission count display in the UI
  
  2. Purpose
    - Ensures that petri_observations and gasifier_observations counts
      are correctly displayed at both Site and Submission levels
    - Optimizes query performance by reducing subqueries
*/

-- 1. Create a view for submissions with their observation counts
CREATE OR REPLACE VIEW submissions_with_counts AS
SELECT 
  s.*,
  COALESCE((SELECT COUNT(*) FROM petri_observations po WHERE po.submission_id = s.submission_id), 0) AS petri_count,
  COALESCE((SELECT COUNT(*) FROM gasifier_observations go WHERE go.submission_id = s.submission_id), 0) AS gasifier_count
FROM 
  submissions s;

-- 2. Create a more efficient function to get submissions with observation counts
CREATE OR REPLACE FUNCTION get_site_submissions_with_counts(
  p_site_id UUID, 
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  submission_id UUID,
  site_id UUID,
  program_id UUID,
  temperature NUMERIC,
  humidity NUMERIC,
  airflow TEXT,
  odor_distance TEXT,
  weather TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  program_name TEXT,
  lastupdated_by UUID,
  indoor_temperature NUMERIC,
  indoor_humidity NUMERIC,
  petri_count BIGINT,
  gasifier_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.submission_id,
    s.site_id,
    s.program_id,
    s.temperature,
    s.humidity,
    s.airflow::TEXT,
    s.odor_distance::TEXT,
    s.weather::TEXT,
    s.notes::TEXT,
    s.created_by,
    s.created_at,
    s.updated_at,
    s.program_name,
    s.lastupdated_by,
    s.indoor_temperature,
    s.indoor_humidity,
    s.petri_count::BIGINT,
    s.gasifier_count::BIGINT
  FROM 
    submissions_with_counts s
  WHERE 
    s.site_id = p_site_id
  ORDER BY 
    s.created_at DESC
  LIMIT 
    p_limit
  OFFSET
    p_offset;
END;
$$;

-- 3. Create an optimized function to get recent submissions across programs and sites
CREATE OR REPLACE FUNCTION get_recent_submissions_v3(
  limit_param INTEGER DEFAULT 10,
  program_id_param UUID DEFAULT NULL,
  site_id_param UUID DEFAULT NULL
)
RETURNS TABLE (
  submission_id UUID,
  site_id UUID,
  site_name TEXT,
  program_id UUID,
  program_name TEXT,
  temperature NUMERIC,
  humidity NUMERIC,
  created_at TIMESTAMPTZ,
  petri_count BIGINT,
  gasifier_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.submission_id,
    s.site_id,
    sites.name::TEXT AS site_name,
    s.program_id,
    pp.name::TEXT AS program_name,
    s.temperature,
    s.humidity,
    s.created_at,
    s.petri_count::BIGINT,
    s.gasifier_count::BIGINT
  FROM 
    submissions_with_counts s
    JOIN sites ON s.site_id = sites.site_id
    JOIN pilot_programs pp ON s.program_id = pp.program_id
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
$$;

-- 4. Grant execute permissions
GRANT EXECUTE ON FUNCTION get_site_submissions_with_counts(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_submissions_v3(INTEGER, UUID, UUID) TO authenticated;

-- 5. Add comments for documentation
COMMENT ON VIEW submissions_with_counts IS 'View of submissions with their petri and gasifier observation counts';
COMMENT ON FUNCTION get_site_submissions_with_counts(UUID, INTEGER, INTEGER) IS 'Retrieves submissions for a site with observation counts, with pagination';
COMMENT ON FUNCTION get_recent_submissions_v3(INTEGER, UUID, UUID) IS 'Retrieves recent submissions with observation counts, filtered by program and/or site';