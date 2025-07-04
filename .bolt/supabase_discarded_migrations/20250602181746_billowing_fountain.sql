-- Create helper function to check if user is company admin for a program
CREATE OR REPLACE FUNCTION is_company_admin_for_program(program_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  company_id_val UUID;
BEGIN
  -- Get the company_id for the program
  SELECT company_id INTO company_id_val
  FROM pilot_programs
  WHERE program_id = program_id_param;
  
  -- If program has no company, return false
  IF company_id_val IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if user is an admin for this company
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() 
    AND company_id = company_id_val
    AND is_company_admin = TRUE
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION is_company_admin_for_program(UUID) TO authenticated;

-- Update sites delete policy
DROP POLICY IF EXISTS sites_delete ON sites;
CREATE POLICY sites_delete ON sites
FOR DELETE 
TO authenticated
USING (
  -- Program admins and editors can delete
  program_id IN (
    SELECT program_id FROM pilot_program_users
    WHERE user_id = auth.uid() 
    AND (role = 'Admin' OR role = 'Edit')
  )
  -- OR company admins can delete
  OR is_company_admin_for_program(program_id)
);

-- Update submissions delete policy
DROP POLICY IF EXISTS submissions_delete ON submissions;
CREATE POLICY submissions_delete ON submissions
FOR DELETE 
TO authenticated
USING (
  -- Program admins and editors can delete
  site_id IN (
    SELECT sites.site_id FROM sites
    JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
    WHERE pilot_program_users.user_id = auth.uid()
    AND (pilot_program_users.role = 'Admin' OR pilot_program_users.role = 'Edit')
  )
  -- OR company admins can delete 
  OR site_id IN (
    SELECT sites.site_id FROM sites
    JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
    WHERE is_company_admin_for_program(pilot_programs.program_id)
  )
);

-- Update petri_observations delete policy to match
DROP POLICY IF EXISTS petri_observations_delete ON petri_observations;
CREATE POLICY petri_observations_delete ON petri_observations
FOR DELETE 
TO authenticated
USING (
  -- Program admins and editors can delete
  submission_id IN (
    SELECT submissions.submission_id FROM submissions
    JOIN sites ON submissions.site_id = sites.site_id
    JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
    WHERE pilot_program_users.user_id = auth.uid()
    AND (pilot_program_users.role = 'Admin' OR pilot_program_users.role = 'Edit')
  )
  -- OR company admins can delete
  OR submission_id IN (
    SELECT submissions.submission_id FROM submissions
    JOIN sites ON submissions.site_id = sites.site_id
    JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
    WHERE is_company_admin_for_program(pilot_programs.program_id)
  )
);