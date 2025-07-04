-- Add company-based RLS policies for program access
-- This migration updates RLS policies to support company-level data visibility

-- Drop existing policies for pilot_programs
DROP POLICY IF EXISTS "pilot_programs_policy" ON "public"."pilot_programs";

-- Create enhanced SELECT policy for pilot_programs
CREATE POLICY "pilot_programs_policy" ON pilot_programs
  FOR SELECT
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

-- Drop existing policies for sites
DROP POLICY IF EXISTS "sites_policy" ON "public"."sites";

-- Create enhanced SELECT policy for sites
CREATE POLICY "sites_policy" ON sites
  FOR SELECT
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

-- Drop existing policies for submissions
DROP POLICY IF EXISTS "submissions_policy" ON "public"."submissions";

-- Create enhanced SELECT policy for submissions
CREATE POLICY "submissions_policy" ON submissions
  FOR SELECT
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

-- Drop existing policies for petri_observations
DROP POLICY IF EXISTS "petri_observations_policy" ON "public"."petri_observations";

-- Create enhanced SELECT policy for petri_observations
CREATE POLICY "petri_observations_policy" ON petri_observations
  FOR SELECT
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

-- Add policies for company-based write operations
CREATE POLICY "Company admins can create programs" ON pilot_programs
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM users
      WHERE id = auth.uid() AND is_company_admin = TRUE
    )
  );

CREATE POLICY "Company admins can update programs" ON pilot_programs
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM users
      WHERE id = auth.uid() AND is_company_admin = TRUE
    )
  );

CREATE POLICY "Company admins can delete programs" ON pilot_programs
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM users
      WHERE id = auth.uid() AND is_company_admin = TRUE
    )
  );