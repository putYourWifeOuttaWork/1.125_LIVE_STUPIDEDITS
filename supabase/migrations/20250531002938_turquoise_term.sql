-- Create functions to count unique petris based on petri_code
-- This approach ensures we count each unique petri dish rather than total observations

-- Create function to update site petri counts based on unique petri codes
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

-- Update the increment_site_petris function to use unique petri codes
CREATE OR REPLACE FUNCTION increment_site_petris(s_site_id UUID, petri_count INTEGER)
RETURNS VOID AS $$
BEGIN
  -- Instead of incrementing by a count, recalculate the total unique petris
  PERFORM update_site_petri_count(s_site_id);
END;
$$ LANGUAGE plpgsql;

-- Create function to get the count of unique petri codes for a submission
CREATE OR REPLACE FUNCTION get_submission_unique_petri_count(s_submission_id UUID)
RETURNS INTEGER AS $$
DECLARE
  unique_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT petri_code) INTO unique_count
  FROM petri_observations
  WHERE submission_id = s_submission_id;
  
  RETURN unique_count;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to update site petri count when observations are modified
CREATE OR REPLACE FUNCTION trigger_update_site_petri_count()
RETURNS TRIGGER AS $$
BEGIN
  -- For inserts and updates, update the count for the site
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    PERFORM update_site_petri_count(NEW.site_id);
  -- For deletes, update the count for the site that was affected
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM update_site_petri_count(OLD.site_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add the trigger to the petri_observations table
DROP TRIGGER IF EXISTS update_site_petri_count_trigger ON petri_observations;
CREATE TRIGGER update_site_petri_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON petri_observations
FOR EACH ROW EXECUTE PROCEDURE trigger_update_site_petri_count();

-- Run the update function for all sites to ensure data consistency
DO $$
DECLARE
  site_rec RECORD;
BEGIN
  FOR site_rec IN SELECT site_id FROM sites LOOP
    PERFORM update_site_petri_count(site_rec.site_id);
  END LOOP;
END $$;