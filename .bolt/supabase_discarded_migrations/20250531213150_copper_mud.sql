-- Fix Company-based Visibility for Pilot Programs
-- This migration updates RLS policies to ensure proper data isolation between companies
-- and addresses the issue of users seeing programs they shouldn't have access to.

-- 1. Drop existing SELECT policies for pilot_programs
DROP POLICY IF EXISTS "pilot_programs_policy" ON "public"."pilot_programs";

-- 2. Create more restrictive SELECT policy for pilot_programs
-- This ensures users only see programs they have direct access to or from their own company
CREATE POLICY "pilot_programs_policy" ON pilot_programs
  FOR SELECT
  TO public
  USING (
    -- Users can see programs they are explicitly added to via pilot_program_users
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    )
    OR 
    -- Users can only see company programs if they have a company_id AND 
    -- that company_id matches the program's company_id
    (
      company_id IN (
        SELECT company_id FROM users
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    )
  );

-- 3. Also update policies for sites to match the same visibility rules
DROP POLICY IF EXISTS "sites_policy" ON "public"."sites";

CREATE POLICY "sites_policy" ON sites
  FOR SELECT
  TO public
  USING (
    -- Direct program access through pilot_program_users
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    ) 
    OR 
    -- Company-based access (only if user has a company)
    (
      program_id IN (
        SELECT program_id FROM pilot_programs
        WHERE company_id IN (
          SELECT company_id FROM users
          WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      )
    )
  );

-- 4. Update submissions policy to match the same visibility rules
DROP POLICY IF EXISTS "submissions_policy" ON "public"."submissions";

CREATE POLICY "submissions_policy" ON submissions
  FOR SELECT
  TO public
  USING (
    -- Direct program access through pilot_program_users
    site_id IN (
      SELECT sites.site_id FROM sites
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    ) 
    OR 
    -- Company-based access (only if user has a company)
    (
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

-- 5. Update petri_observations policy to match the same visibility rules
DROP POLICY IF EXISTS "petri_observations_policy" ON "public"."petri_observations";

CREATE POLICY "petri_observations_policy" ON petri_observations
  FOR SELECT
  TO public
  USING (
    -- Direct program access through pilot_program_users
    submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    ) 
    OR 
    -- Company-based access (only if user has a company)
    (
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