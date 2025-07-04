/*
  # Fix Ambiguous Column References in SQL Functions
  
  1. Changes
    - Drop existing functions with ambiguous column references
    - Recreate functions with explicit column aliasing
    - Fix the "column reference program_id is ambiguous" error
  
  2. Functions Fixed
    - get_recent_submissions_v3
    - fetch_submissions_for_site
*/

-- 1. Drop the existing functions
DROP FUNCTION IF EXISTS get_recent_submissions_v3(integer, uuid, uuid);
DROP FUNCTION IF EXISTS fetch_submissions_for_site(uuid);

-- 2. Recreate get_recent_submissions_v3 with explicit column aliasing
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
  gasifier_count BIGINT,
  global_submission_id BIGINT
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
    s.program_id AS program_id, -- Explicit alias
    pp.name::TEXT AS program_name,
    s.temperature,
    s.humidity,
    s.created_at,
    s.petri_count::BIGINT,
    s.gasifier_count::BIGINT,
    s.global_submission_id
  FROM 
    submissions_with_counts s
    JOIN sites ON s.site_id = sites.site_id
    JOIN pilot_programs pp ON s.program_id = pp.program_id
  WHERE 
    (
      -- Either user has direct access to the program
      s.program_id IN (
        SELECT ppu.program_id FROM pilot_program_users ppu WHERE ppu.user_id = auth.uid()
      )
      -- Or user's company has access to the program
      OR s.program_id IN (
        SELECT pp2.program_id FROM pilot_programs pp2
        WHERE pp2.company_id IN (
          SELECT u.company_id FROM users u WHERE u.id = auth.uid() AND u.company_id IS NOT NULL
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

-- 3. Recreate fetch_submissions_for_site with explicit column aliasing
CREATE OR REPLACE FUNCTION fetch_submissions_for_site(
  p_site_id UUID
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
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  petri_count BIGINT,
  gasifier_count BIGINT,
  global_submission_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.submission_id,
    s.site_id,
    s.program_id AS program_id, -- Explicit alias
    s.temperature,
    s.humidity,
    s.airflow::TEXT,
    s.odor_distance::TEXT,
    s.weather::TEXT,
    COALESCE(s.notes, '')::TEXT,
    s.created_at,
    s.updated_at,
    COUNT(DISTINCT po.observation_id)::BIGINT AS petri_count,
    COUNT(DISTINCT go.observation_id)::BIGINT AS gasifier_count,
    s.global_submission_id
  FROM 
    submissions s
    LEFT JOIN petri_observations po ON s.submission_id = po.submission_id
    LEFT JOIN gasifier_observations go ON s.submission_id = go.submission_id
  WHERE 
    s.site_id = p_site_id
  GROUP BY
    s.submission_id, s.site_id, s.program_id, s.temperature, s.humidity,
    s.airflow, s.odor_distance, s.weather, s.notes, s.created_at, s.updated_at,
    s.global_submission_id
  ORDER BY 
    s.created_at DESC;
END;
$$;

-- 4. Grant execute permissions
GRANT EXECUTE ON FUNCTION get_recent_submissions_v3(integer, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fetch_submissions_for_site(uuid) TO authenticated;

-- 5. Add comments for documentation
COMMENT ON FUNCTION get_recent_submissions_v3 IS 'Returns recent submissions with observation counts, filtered by program and/or site';
COMMENT ON FUNCTION fetch_submissions_for_site IS 'Retrieves submissions for a site with observation counts';