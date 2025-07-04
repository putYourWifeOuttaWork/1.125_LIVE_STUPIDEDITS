-- Add program_name, user_email, and audit trail columns to database schema

-- 1. Add program_name to sites table
ALTER TABLE sites ADD COLUMN program_name VARCHAR(100);

-- 2. Add program_name to submissions table
ALTER TABLE submissions ADD COLUMN program_name VARCHAR(100);

-- 3. Add program_name to petri_observations table
ALTER TABLE petri_observations ADD COLUMN program_name VARCHAR(100);

-- 4. Add user_email to pilot_program_users table
ALTER TABLE pilot_program_users ADD COLUMN user_email VARCHAR(255);

-- 5. Add lastUpdated_by columns for audit trail
ALTER TABLE pilot_programs ADD COLUMN lastUpdated_by UUID REFERENCES auth.users(id);
ALTER TABLE sites ADD COLUMN lastUpdated_by UUID REFERENCES auth.users(id);
ALTER TABLE submissions ADD COLUMN lastUpdated_by UUID REFERENCES auth.users(id);
ALTER TABLE petri_observations ADD COLUMN lastUpdated_by UUID REFERENCES auth.users(id);

-- 6. Create function to update program_name and lastUpdated_by fields
CREATE OR REPLACE FUNCTION update_program_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- Set lastUpdated_by to the current user
  NEW.lastUpdated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create function to update sites with program_name
CREATE OR REPLACE FUNCTION update_site_program_name()
RETURNS TRIGGER AS $$
DECLARE
  prog_name VARCHAR;
BEGIN
  -- Get program name
  SELECT name INTO prog_name FROM pilot_programs WHERE program_id = NEW.program_id;
  NEW.program_name = prog_name;
  NEW.lastUpdated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create function to update submissions with program_name
CREATE OR REPLACE FUNCTION update_submission_program_name()
RETURNS TRIGGER AS $$
DECLARE
  prog_name VARCHAR;
BEGIN
  -- Get program name from the program_id
  SELECT name INTO prog_name FROM pilot_programs WHERE program_id = NEW.program_id;
  NEW.program_name = prog_name;
  NEW.lastUpdated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Create function to update petri_observations with program_name
CREATE OR REPLACE FUNCTION update_petri_observation_program_name()
RETURNS TRIGGER AS $$
DECLARE
  prog_name VARCHAR;
  prog_id UUID;
BEGIN
  -- First get the program_id from the submission
  SELECT program_id INTO prog_id FROM submissions WHERE submission_id = NEW.submission_id;
  -- Then get the program name
  SELECT name INTO prog_name FROM pilot_programs WHERE program_id = prog_id;
  NEW.program_name = prog_name;
  NEW.lastUpdated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Create function to update pilot_program_users with user_email
CREATE OR REPLACE FUNCTION update_program_user_email()
RETURNS TRIGGER AS $$
DECLARE
  user_email_val VARCHAR;
BEGIN
  -- Get user email
  SELECT email INTO user_email_val FROM auth.users WHERE id = NEW.user_id;
  NEW.user_email = user_email_val;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Create or update triggers for updating lastUpdated_by
DROP TRIGGER IF EXISTS update_pilot_program_metadata ON pilot_programs;
CREATE TRIGGER update_pilot_program_metadata
BEFORE UPDATE ON pilot_programs
FOR EACH ROW
EXECUTE FUNCTION update_program_metadata();

-- 12. Create or update triggers for updating site program_name and lastUpdated_by
DROP TRIGGER IF EXISTS update_site_metadata ON sites;
CREATE TRIGGER update_site_metadata
BEFORE INSERT OR UPDATE ON sites
FOR EACH ROW
EXECUTE FUNCTION update_site_program_name();

-- 13. Create or update triggers for updating submission program_name and lastUpdated_by
DROP TRIGGER IF EXISTS update_submission_metadata ON submissions;
CREATE TRIGGER update_submission_metadata
BEFORE INSERT OR UPDATE ON submissions
FOR EACH ROW
EXECUTE FUNCTION update_submission_program_name();

-- 14. Create or update triggers for updating petri_observation program_name and lastUpdated_by
DROP TRIGGER IF EXISTS update_petri_observation_metadata ON petri_observations;
CREATE TRIGGER update_petri_observation_metadata
BEFORE INSERT OR UPDATE ON petri_observations
FOR EACH ROW
EXECUTE FUNCTION update_petri_observation_program_name();

-- 15. Create or update trigger for updating pilot_program_users user_email
DROP TRIGGER IF EXISTS update_program_user_email_trigger ON pilot_program_users;
CREATE TRIGGER update_program_user_email_trigger
BEFORE INSERT OR UPDATE ON pilot_program_users
FOR EACH ROW
EXECUTE FUNCTION update_program_user_email();

-- 16. Populate existing data with program_name
-- Update sites
UPDATE sites s
SET program_name = p.name
FROM pilot_programs p
WHERE s.program_id = p.program_id
AND s.program_name IS NULL;

-- Update submissions
UPDATE submissions s
SET program_name = p.name
FROM pilot_programs p
WHERE s.program_id = p.program_id
AND s.program_name IS NULL;

-- Update petri_observations via submissions
UPDATE petri_observations po
SET program_name = p.name
FROM submissions s
JOIN pilot_programs p ON s.program_id = p.program_id
WHERE po.submission_id = s.submission_id
AND po.program_name IS NULL;

-- Update pilot_program_users with user_email
UPDATE pilot_program_users ppu
SET user_email = u.email
FROM auth.users u
WHERE ppu.user_id = u.id
AND ppu.user_email IS NULL;