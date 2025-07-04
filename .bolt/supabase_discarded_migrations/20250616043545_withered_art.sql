/*
  # Revert Recent RLS Policy Changes
  
  1. Changes
    - Revert the changes made in the following migrations:
      - 20250616042513_light_cell.sql
      - 20250616042932_jade_mode.sql
    - Restore original RLS policies that allow users to see:
      a) Programs they have direct access to OR company-based access to
      b) Audit logs for programs they are admins of
    
  2. Purpose
    - Fix the issue where users can no longer see programs they should have access to
    - Restore proper visibility across companies for authorized users
*/

-- 1. First, drop the restrictive policies that were created

-- Drop the policy for pilot_program_history
DROP POLICY IF EXISTS "Users can view history for their company's programs" ON pilot_program_history;

-- Drop the policies for all tables
DROP POLICY IF EXISTS "pilot_programs_policy" ON pilot_programs;
DROP POLICY IF EXISTS "sites_policy" ON sites;
DROP POLICY IF EXISTS "submissions_policy" ON submissions;
DROP POLICY IF EXISTS "petri_observations_policy" ON petri_observations;
DROP POLICY IF EXISTS "gasifier_observations_policy" ON gasifier_observations;

-- 2. Recreate the original policies

-- Recreate policy for pilot_program_history to allow admin access
CREATE POLICY "Users can view history for their programs" ON pilot_program_history
  FOR SELECT
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users 
      WHERE user_id = auth.uid() AND role = 'Admin'
    )
  );

-- Recreate policy for pilot_programs with original logic (direct access OR company access)
CREATE POLICY "pilot_programs_policy" ON pilot_programs
  FOR SELECT
  TO public
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    ) OR (
      company_id IN (
        SELECT company_id FROM users
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    )
  );

-- Recreate policy for sites with original logic
CREATE POLICY "sites_policy" ON sites
  FOR SELECT
  TO public
  USING (
    program_id IN (
      -- Direct program access
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    ) OR (
      -- Company-based access
      program_id IN (
        SELECT program_id FROM pilot_programs
        WHERE company_id IN (
          SELECT company_id FROM users
          WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      )
    )
  );

-- Recreate policy for submissions with original logic
CREATE POLICY "submissions_policy" ON submissions
  FOR SELECT
  TO public
  USING (
    site_id IN (
      -- Direct program access
      SELECT sites.site_id FROM sites
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    ) OR (
      -- Company-based access
      site_id IN (
        SELECT sites.site_id FROM sites
        JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
        WHERE pilot_programs.company_id IN (
          SELECT company_id FROM users
          WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      )
    )
  );

-- Recreate policy for petri_observations with original logic
CREATE POLICY "petri_observations_policy" ON petri_observations
  FOR SELECT
  TO public
  USING (
    submission_id IN (
      -- Direct program access
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    ) OR (
      -- Company-based access
      submission_id IN (
        SELECT submissions.submission_id FROM submissions
        JOIN sites ON submissions.site_id = sites.site_id
        JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
        WHERE pilot_programs.company_id IN (
          SELECT company_id FROM users
          WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      )
    )
  );

-- Recreate policy for gasifier_observations with original logic
CREATE POLICY "gasifier_observations_policy" ON gasifier_observations
  FOR SELECT
  TO public
  USING (
    submission_id IN (
      -- Direct program access
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    ) OR (
      -- Company-based access
      submission_id IN (
        SELECT submissions.submission_id FROM submissions
        JOIN sites ON submissions.site_id = sites.site_id
        JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
        WHERE pilot_programs.company_id IN (
          SELECT company_id FROM users
          WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      )
    )
  );

-- 3. Add comments for documentation
COMMENT ON POLICY "Users can view history for their programs" ON pilot_program_history IS 'Allows program admins to view audit history for programs they administer';
COMMENT ON POLICY "pilot_programs_policy" ON pilot_programs IS 'Allows users to view programs they have direct access to OR programs from their company';
COMMENT ON POLICY "sites_policy" ON sites IS 'Allows users to view sites in programs they have direct access to OR from their company';
COMMENT ON POLICY "submissions_policy" ON submissions IS 'Allows users to view submissions for sites they have access to directly OR via company';
COMMENT ON POLICY "petri_observations_policy" ON petri_observations IS 'Allows users to view petri observations for submissions they have access to directly OR via company';
COMMENT ON POLICY "gasifier_observations_policy" ON gasifier_observations IS 'Allows users to view gasifier observations for submissions they have access to directly OR via company';