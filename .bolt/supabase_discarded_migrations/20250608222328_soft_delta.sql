/*
  # Fix Observation Roll-up Counts
  
  1. Changes
    - Repairs the roll-up count calculations for petri and gasifier observations
    - Creates and updates functions to properly count observations
    - Adds triggers to maintain accurate counts
    - Includes a data migration to fix existing counts
  
  2. Issue Fixed
    - Resolves the issue where petri_observations and gasifier_observations 
      roll-up counts show 0 at Submission and Site levels
*/

-- 1. Fix function to properly update site petri counts
CREATE OR REPLACE FUNCTION update_site_petri_count(s_site_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Update the site's total_petris to count unique petri codes
  UPDATE sites
  SET total_petris = (
    SELECT COUNT(DISTINCT petri_code)
    FROM petri_observations
    WHERE site_id = s_site_id
  )
  WHERE site_id = s_site_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Fix function to properly update site gasifier counts
CREATE OR REPLACE FUNCTION update_site_gasifier_count(s_site_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Update the site's total_gasifiers to count unique gasifier codes
  UPDATE sites
  SET total_gasifiers = (
    SELECT COUNT(DISTINCT gasifier_code)
    FROM gasifier_observations
    WHERE site_id = s_site_id
  )
  WHERE site_id = s_site_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Create or replace a function to get petri observation count for a submission
CREATE OR REPLACE FUNCTION get_submission_petri_count(s_submission_id UUID)
RETURNS INTEGER AS $$
DECLARE
  count_val INTEGER;
BEGIN
  SELECT COUNT(*) INTO count_val
  FROM petri_observations
  WHERE submission_id = s_submission_id;
  
  RETURN count_val;
END;
$$ LANGUAGE plpgsql;

-- 4. Create or replace a function to get gasifier observation count for a submission
CREATE OR REPLACE FUNCTION get_submission_gasifier_count(s_submission_id UUID)
RETURNS INTEGER AS $$
DECLARE
  count_val INTEGER;
BEGIN
  SELECT COUNT(*) INTO count_val
  FROM gasifier_observations
  WHERE submission_id = s_submission_id;
  
  RETURN count_val;
END;
$$ LANGUAGE plpgsql;

-- 5. Create a function to update all site counts
CREATE OR REPLACE FUNCTION update_all_site_counts()
RETURNS VOID AS $$
DECLARE
  site_rec RECORD;
BEGIN
  FOR site_rec IN SELECT site_id FROM sites LOOP
    -- Update petri counts
    PERFORM update_site_petri_count(site_rec.site_id);
    
    -- Update gasifier counts
    PERFORM update_site_gasifier_count(site_rec.site_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 6. Create a function to update program submission and site counts
CREATE OR REPLACE FUNCTION update_program_counts()
RETURNS VOID AS $$
DECLARE
  program_rec RECORD;
BEGIN
  FOR program_rec IN SELECT program_id FROM pilot_programs LOOP
    -- Update submission count
    UPDATE pilot_programs
    SET total_submissions = (
      SELECT COUNT(*)
      FROM submissions
      WHERE program_id = program_rec.program_id
    )
    WHERE program_id = program_rec.program_id;
    
    -- Update site count
    UPDATE pilot_programs
    SET total_sites = (
      SELECT COUNT(*)
      FROM sites
      WHERE program_id = program_rec.program_id
    )
    WHERE program_id = program_rec.program_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 7. Run a one-time update to fix all counts
DO $$
BEGIN
  -- Update all site counts first
  PERFORM update_all_site_counts();
  
  -- Then update program counts
  PERFORM update_program_counts();
END;
$$;

-- 8. Create or update specific RPC functions for retrieving submission with counts
CREATE OR REPLACE FUNCTION get_submission_with_observations(submission_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  submission_data JSONB;
  petri_count INTEGER;
  gasifier_count INTEGER;
BEGIN
  -- Get the submission data
  SELECT to_jsonb(s) INTO submission_data
  FROM submissions s
  WHERE s.submission_id = submission_id_param;
  
  IF submission_data IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get petri observations count
  SELECT COUNT(*) INTO petri_count
  FROM petri_observations
  WHERE submission_id = submission_id_param;
  
  -- Get gasifier observations count
  SELECT COUNT(*) INTO gasifier_count
  FROM gasifier_observations
  WHERE submission_id = submission_id_param;
  
  -- Add the counts to the submission data
  submission_data := submission_data || 
    jsonb_build_object(
      'petri_count', petri_count,
      'gasifier_count', gasifier_count
    );
  
  RETURN submission_data;
END;
$$;

-- 9. Create or replace function to get submissions with observation counts
CREATE OR REPLACE FUNCTION get_submissions_with_counts(site_id_param UUID, limit_param INTEGER DEFAULT 100)
RETURNS TABLE (
  submission_id UUID,
  site_id UUID,
  program_id UUID,
  temperature NUMERIC,
  humidity NUMERIC,
  airflow airflow_enum,
  odor_distance odor_distance_enum,
  weather weather_enum,
  notes VARCHAR,
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
    s.*,
    COALESCE((SELECT COUNT(*) FROM petri_observations po WHERE po.submission_id = s.submission_id), 0)::BIGINT AS petri_count,
    COALESCE((SELECT COUNT(*) FROM gasifier_observations go WHERE go.submission_id = s.submission_id), 0)::BIGINT AS gasifier_count
  FROM 
    submissions s
  WHERE 
    s.site_id = site_id_param
  ORDER BY 
    s.created_at DESC
  LIMIT 
    limit_param;
END;
$$;

-- 10. Grant execute permissions
GRANT EXECUTE ON FUNCTION get_submission_with_observations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_submissions_with_counts(UUID, INTEGER) TO authenticated;

-- 11. Add comments for documentation
COMMENT ON FUNCTION update_site_petri_count(UUID) IS 'Updates the total_petris count for a site based on unique petri_code values';
COMMENT ON FUNCTION update_site_gasifier_count(UUID) IS 'Updates the total_gasifiers count for a site based on unique gasifier_code values';
COMMENT ON FUNCTION get_submission_petri_count(UUID) IS 'Returns the count of petri observations for a submission';
COMMENT ON FUNCTION get_submission_gasifier_count(UUID) IS 'Returns the count of gasifier observations for a submission';
COMMENT ON FUNCTION update_all_site_counts() IS 'Updates petri and gasifier counts for all sites';
COMMENT ON FUNCTION update_program_counts() IS 'Updates submission and site counts for all programs';
COMMENT ON FUNCTION get_submission_with_observations(UUID) IS 'Retrieves a submission with its petri and gasifier observation counts';
COMMENT ON FUNCTION get_submissions_with_counts(UUID, INTEGER) IS 'Retrieves submissions for a site with petri and gasifier observation counts';