/*
  # Fix Pilot Program Roll-up Counts

  1. Changes
    - Add triggers to maintain accurate site and submission counts
    - Add functions to recalculate counts
    - Add function to update all counts
    - Run initial update on all programs
    
  2. Reason for Change
    - Current roll-up counts for sites and submissions are inaccurate
    - Need automated maintenance of these counts
*/

-- Create function to update pilot program counts
CREATE OR REPLACE FUNCTION update_pilot_program_counts(p_program_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Update the program's total counts
  UPDATE pilot_programs
  SET 
    total_sites = (
      SELECT COUNT(*)
      FROM sites
      WHERE program_id = p_program_id
    ),
    total_submissions = (
      SELECT COUNT(*)
      FROM submissions
      WHERE program_id = p_program_id
    )
  WHERE program_id = p_program_id;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function for sites
CREATE OR REPLACE FUNCTION trigger_update_program_site_count()
RETURNS TRIGGER AS $$
BEGIN
  -- For inserts and updates, update the count for the program
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    PERFORM update_pilot_program_counts(NEW.program_id);
  -- For deletes, update the count for the program that was affected
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM update_pilot_program_counts(OLD.program_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function for submissions
CREATE OR REPLACE FUNCTION trigger_update_program_submission_count()
RETURNS TRIGGER AS $$
BEGIN
  -- For inserts and updates, update the count for the program
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    PERFORM update_pilot_program_counts(NEW.program_id);
  -- For deletes, update the count for the program that was affected
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM update_pilot_program_counts(OLD.program_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to sites table
DROP TRIGGER IF EXISTS update_program_site_count_trigger ON sites;
CREATE TRIGGER update_program_site_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON sites
FOR EACH ROW EXECUTE PROCEDURE trigger_update_program_site_count();

-- Add triggers to submissions table
DROP TRIGGER IF EXISTS update_program_submission_count_trigger ON submissions;
CREATE TRIGGER update_program_submission_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON submissions
FOR EACH ROW EXECUTE PROCEDURE trigger_update_program_submission_count();

-- Run initial update on all programs to fix existing counts
DO $$
DECLARE
  program_rec RECORD;
BEGIN
  FOR program_rec IN SELECT program_id FROM pilot_programs LOOP
    PERFORM update_pilot_program_counts(program_rec.program_id);
  END LOOP;
END $$;