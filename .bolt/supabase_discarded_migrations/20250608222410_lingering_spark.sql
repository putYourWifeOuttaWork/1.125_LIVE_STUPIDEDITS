/*
  # Fix RPC Functions for React Hooks
  
  1. Changes
    - Updates useSubmissions hook-related RPC functions
    - Ensures consistent return types for RPC functions
    - Fixes issues with SQL type conversions
  
  2. Purpose
    - Resolves issues with submission roll-up counts in the UI
    - Ensures the React hooks receive correctly formatted data
*/

-- 1. Create a new function for fetching submissions that works well with the hooks
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
    COALESCE(s.notes, '')::TEXT,
    s.created_at,
    s.updated_at,
    COUNT(DISTINCT po.observation_id)::BIGINT AS petri_count,
    COUNT(DISTINCT go.observation_id)::BIGINT AS gasifier_count
  FROM 
    submissions s
    LEFT JOIN petri_observations po ON s.submission_id = po.submission_id
    LEFT JOIN gasifier_observations go ON s.submission_id = go.submission_id
  WHERE 
    s.site_id = p_site_id
  GROUP BY
    s.submission_id, s.site_id, s.program_id, s.temperature, s.humidity,
    s.airflow, s.odor_distance, s.weather, s.notes, s.created_at, s.updated_at
  ORDER BY 
    s.created_at DESC;
END;
$$;

-- 2. Create an advanced function to get site details with observation counts
CREATE OR REPLACE FUNCTION get_site_with_counts(p_site_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  site_data JSONB;
  submission_count INTEGER;
  unique_petri_codes INTEGER;
  unique_gasifier_codes INTEGER;
BEGIN
  -- Get the site data
  SELECT to_jsonb(s) INTO site_data
  FROM sites s
  WHERE s.site_id = p_site_id;
  
  IF site_data IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Count submissions
  SELECT COUNT(*) INTO submission_count
  FROM submissions
  WHERE site_id = p_site_id;
  
  -- Count unique petri codes
  SELECT COUNT(DISTINCT petri_code) INTO unique_petri_codes
  FROM petri_observations
  WHERE site_id = p_site_id;
  
  -- Count unique gasifier codes
  SELECT COUNT(DISTINCT gasifier_code) INTO unique_gasifier_codes
  FROM gasifier_observations
  WHERE site_id = p_site_id;
  
  -- Add counts to the site data
  site_data := site_data || 
    jsonb_build_object(
      'submission_count', submission_count,
      'total_petris', unique_petri_codes,
      'total_gasifiers', unique_gasifier_codes
    );
  
  -- Update the site with the latest counts if they differ
  IF (site_data->>'total_petris')::INTEGER != unique_petri_codes OR 
     (site_data->>'total_gasifiers')::INTEGER != unique_gasifier_codes THEN
    
    UPDATE sites
    SET 
      total_petris = unique_petri_codes,
      total_gasifiers = unique_gasifier_codes
    WHERE site_id = p_site_id;
  END IF;
  
  RETURN site_data;
END;
$$;

-- 3. Create a utility function to refresh all roll-up counts
CREATE OR REPLACE FUNCTION refresh_all_rollup_counts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  site_rec RECORD;
  submission_rec RECORD;
  program_rec RECORD;
  stats JSONB;
BEGIN
  -- Initialize stats
  stats := jsonb_build_object(
    'sites_updated', 0,
    'programs_updated', 0
  );
  
  -- Update site counts
  FOR site_rec IN SELECT site_id FROM sites LOOP
    -- Update petri counts
    UPDATE sites
    SET total_petris = (
      SELECT COUNT(DISTINCT petri_code)
      FROM petri_observations
      WHERE site_id = site_rec.site_id
    )
    WHERE site_id = site_rec.site_id;
    
    -- Update gasifier counts
    UPDATE sites
    SET total_gasifiers = (
      SELECT COUNT(DISTINCT gasifier_code)
      FROM gasifier_observations
      WHERE site_id = site_rec.site_id
    )
    WHERE site_id = site_rec.site_id;
    
    -- Increment stats
    stats := stats || jsonb_build_object('sites_updated', (stats->>'sites_updated')::INTEGER + 1);
  END LOOP;
  
  -- Update program counts
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
    
    -- Increment stats
    stats := stats || jsonb_build_object('programs_updated', (stats->>'programs_updated')::INTEGER + 1);
  END LOOP;
  
  RETURN stats;
END;
$$;

-- 4. Grant execute permissions
GRANT EXECUTE ON FUNCTION fetch_submissions_for_site(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_site_with_counts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_all_rollup_counts() TO authenticated;

-- 5. Run the refresh function once to fix all counts
SELECT refresh_all_rollup_counts();

-- 6. Add comments for documentation
COMMENT ON FUNCTION fetch_submissions_for_site(UUID) IS 'Fetches submissions for a site with petri and gasifier counts, optimized for React hooks';
COMMENT ON FUNCTION get_site_with_counts(UUID) IS 'Gets a site with accurate observation counts and updates the site record if needed';
COMMENT ON FUNCTION refresh_all_rollup_counts() IS 'Refreshes all roll-up counts across sites and programs';