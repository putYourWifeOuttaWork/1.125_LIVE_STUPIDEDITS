-- 1. Create a new sequence for the global submission ID, starting at 1000000 (7 digits)
CREATE SEQUENCE IF NOT EXISTS global_submission_id_seq START WITH 1000000;

-- 2. Add the global_submission_id column to the submissions table (initially nullable)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS global_submission_id BIGINT;

-- 3. Create a trigger function to automatically assign the next ID from the sequence
CREATE OR REPLACE FUNCTION set_global_submission_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Set the global_submission_id to the next value from the sequence
  NEW.global_submission_id := nextval('global_submission_id_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create a trigger to automatically set the global_submission_id for new submissions
DROP TRIGGER IF EXISTS set_global_submission_id_trigger ON submissions;
CREATE TRIGGER set_global_submission_id_trigger
BEFORE INSERT ON submissions
FOR EACH ROW
EXECUTE FUNCTION set_global_submission_id();

-- 5. Backfill existing submissions with unique global_submission_id values
DO $$
DECLARE
  submission_rec RECORD;
BEGIN
  -- Loop through all existing submissions that don't have a global_submission_id
  FOR submission_rec IN SELECT submission_id FROM submissions WHERE global_submission_id IS NULL LOOP
    UPDATE submissions
    SET global_submission_id = nextval('global_submission_id_seq')
    WHERE submission_id = submission_rec.submission_id;
  END LOOP;
END
$$;

-- 6. Now that all existing records have been backfilled, add NOT NULL constraint
ALTER TABLE submissions ALTER COLUMN global_submission_id SET NOT NULL;

-- 7. Add a UNIQUE constraint to ensure uniqueness
ALTER TABLE submissions ADD CONSTRAINT submissions_global_submission_id_key UNIQUE (global_submission_id);

-- 8. Update submissions view to include global_submission_id
DROP VIEW IF EXISTS submissions_with_counts;
CREATE VIEW submissions_with_counts AS
SELECT 
  s.*,
  COALESCE((SELECT COUNT(*) FROM petri_observations po WHERE po.submission_id = s.submission_id), 0) AS petri_count,
  COALESCE((SELECT COUNT(*) FROM gasifier_observations go WHERE go.submission_id = s.submission_id), 0) AS gasifier_count
FROM 
  submissions s;

-- 9. Explicitly drop the functions before recreating them with new return types
-- Drop get_recent_submissions_v3 function first
DROP FUNCTION IF EXISTS get_recent_submissions_v3(integer, uuid, uuid);

-- Now create the updated function
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
    s.program_id,
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

-- 10. Explicitly drop fetch_submissions_for_site function before recreating it
DROP FUNCTION IF EXISTS fetch_submissions_for_site(UUID);

-- Now create the updated function with global_submission_id
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

-- 11. Add comment explaining the column's purpose
COMMENT ON COLUMN submissions.global_submission_id IS 'Auto-incrementing, globally unique identifier for submissions starting at 1,000,000';

-- 12. Grant execution permissions
GRANT EXECUTE ON FUNCTION get_recent_submissions_v3(integer, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fetch_submissions_for_site(uuid) TO authenticated;