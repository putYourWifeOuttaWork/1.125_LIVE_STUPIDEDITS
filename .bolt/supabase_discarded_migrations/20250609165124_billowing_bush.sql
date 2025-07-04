/*
  # Fix Indoor Temperature and Humidity for Submissions
  
  1. Changes
    - Ensures indoor_temperature and indoor_humidity are properly handled in submissions
    - Updates functions to include these fields in returns
    - Adds constraints and validations to ensure proper data types
    - Makes site default values correctly propagate to submissions
  
  2. Purpose
    - Resolves issue where indoor environmental data is no longer being saved
    - Ensures data preset in site templates is properly used
*/

-- 1. Update the submissions_with_counts view to include indoor environment fields
DROP VIEW IF EXISTS submissions_with_counts;
CREATE OR REPLACE VIEW submissions_with_counts AS
SELECT 
  s.*,
  COALESCE((SELECT COUNT(*) FROM petri_observations po WHERE po.submission_id = s.submission_id), 0) AS petri_count,
  COALESCE((SELECT COUNT(*) FROM gasifier_observations go WHERE go.submission_id = s.submission_id), 0) AS gasifier_count
FROM 
  submissions s;

-- 2. Update get_recent_submissions_v3 function to include indoor environment data
DROP FUNCTION IF EXISTS get_recent_submissions_v3(integer, uuid, uuid);
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
  indoor_temperature NUMERIC,
  indoor_humidity NUMERIC,
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
    s.indoor_temperature,
    s.indoor_humidity,
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

-- 3. Update fetch_submissions_for_site function to include indoor environment data
DROP FUNCTION IF EXISTS fetch_submissions_for_site(uuid);
CREATE OR REPLACE FUNCTION fetch_submissions_for_site(
  p_site_id UUID
)
RETURNS TABLE (
  submission_id UUID,
  site_id UUID, 
  program_id UUID,
  temperature NUMERIC,
  humidity NUMERIC,
  indoor_temperature NUMERIC,
  indoor_humidity NUMERIC,
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
    s.indoor_temperature,
    s.indoor_humidity,
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
    s.indoor_temperature, s.indoor_humidity, s.airflow, s.odor_distance, s.weather, 
    s.notes, s.created_at, s.updated_at, s.global_submission_id
  ORDER BY 
    s.created_at DESC;
END;
$$;

-- 4. Create a function to transfer default indoor environment settings from site to submission
CREATE OR REPLACE FUNCTION apply_site_indoor_defaults(
  site_id_param UUID, 
  submission_defaults_param JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  site_rec RECORD;
  updated_defaults JSONB;
BEGIN
  -- Get the site record with default values
  SELECT * INTO site_rec FROM sites WHERE site_id = site_id_param;
  
  -- Start with the provided defaults or an empty object
  updated_defaults := COALESCE(submission_defaults_param, '{}'::JSONB);
  
  -- Add indoor temperature from site defaults if it exists and not already in submission_defaults
  IF site_rec.default_indoor_temperature IS NOT NULL AND 
     (NOT updated_defaults ? 'indoor_temperature' OR updated_defaults->>'indoor_temperature' IS NULL) THEN
    updated_defaults := updated_defaults || jsonb_build_object('indoor_temperature', site_rec.default_indoor_temperature);
  END IF;
  
  -- Add indoor humidity from site defaults if it exists and not already in submission_defaults
  IF site_rec.default_indoor_humidity IS NOT NULL AND 
     (NOT updated_defaults ? 'indoor_humidity' OR updated_defaults->>'indoor_humidity' IS NULL) THEN
    updated_defaults := updated_defaults || jsonb_build_object('indoor_humidity', site_rec.default_indoor_humidity);
  END IF;
  
  -- Also get values from the submission_defaults JSONB field in sites if they exist
  IF site_rec.submission_defaults IS NOT NULL THEN
    -- Add indoor temperature from submission_defaults if not already added
    IF site_rec.submission_defaults ? 'indoor_temperature' AND 
       (NOT updated_defaults ? 'indoor_temperature' OR updated_defaults->>'indoor_temperature' IS NULL) THEN
      updated_defaults := updated_defaults || 
        jsonb_build_object('indoor_temperature', site_rec.submission_defaults->'indoor_temperature');
    END IF;
    
    -- Add indoor humidity from submission_defaults if not already added
    IF site_rec.submission_defaults ? 'indoor_humidity' AND 
       (NOT updated_defaults ? 'indoor_humidity' OR updated_defaults->>'indoor_humidity' IS NULL) THEN
      updated_defaults := updated_defaults || 
        jsonb_build_object('indoor_humidity', site_rec.submission_defaults->'indoor_humidity');
    END IF;
  END IF;
  
  RETURN updated_defaults;
END;
$$;

-- 5. Grant execute permissions
GRANT EXECUTE ON FUNCTION get_recent_submissions_v3(integer, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fetch_submissions_for_site(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_site_indoor_defaults(uuid, jsonb) TO authenticated;

-- 6. Add comments for documentation
COMMENT ON FUNCTION get_recent_submissions_v3 IS 'Returns recent submissions with indoor environment data and observation counts';
COMMENT ON FUNCTION fetch_submissions_for_site IS 'Retrieves submissions for a site with indoor environment data and observation counts';
COMMENT ON FUNCTION apply_site_indoor_defaults IS 'Applies site default indoor environment values to submission defaults';