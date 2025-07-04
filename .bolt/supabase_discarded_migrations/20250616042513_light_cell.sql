/*
  # Fix Company Data Isolation in RLS Policies
  
  1. Problem
    - Users from one company can currently see programs from another company
    - This is a security issue as it breaks data isolation between companies
  
  2. Solution
    - Update the RLS policies for all tables to enforce strict company-based isolation
    - Remove the conditions that allow access via pilot_program_users membership
    - Only allow access to data from the user's own company
    
  3. Security Impact
    - Users will only see programs and related data from their own company
    - Maintains strict data boundaries between different organizations
*/

-- 1. Drop existing policies for pilot_programs
DROP POLICY IF EXISTS "pilot_programs_policy" ON "public"."pilot_programs";

-- Create new policy for pilot_programs that only allows access to programs from user's company
CREATE POLICY "pilot_programs_policy" ON pilot_programs
  FOR SELECT
  TO public
  USING (
    company_id IN (
      SELECT company_id FROM users
      WHERE id = auth.uid() AND company_id IS NOT NULL
    )
  );

-- 2. Drop existing policies for sites
DROP POLICY IF EXISTS "sites_policy" ON "public"."sites";

-- Create new policy for sites that only allows access to sites from programs in user's company
CREATE POLICY "sites_policy" ON sites
  FOR SELECT
  TO public
  USING (
    program_id IN (
      SELECT program_id FROM pilot_programs
      WHERE company_id IN (
        SELECT company_id FROM users
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    )
  );

-- 3. Drop existing policies for submissions
DROP POLICY IF EXISTS "submissions_policy" ON "public"."submissions";

-- Create new policy for submissions that only allows access to submissions from sites in programs in user's company
CREATE POLICY "submissions_policy" ON submissions
  FOR SELECT
  TO public
  USING (
    site_id IN (
      SELECT sites.site_id FROM sites
      JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
      WHERE pilot_programs.company_id IN (
        SELECT company_id FROM users
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    )
  );

-- 4. Drop existing policies for petri_observations
DROP POLICY IF EXISTS "petri_observations_policy" ON "public"."petri_observations";

-- Create new policy for petri_observations that only allows access to observations from submissions in sites in programs in user's company
CREATE POLICY "petri_observations_policy" ON petri_observations
  FOR SELECT
  TO public
  USING (
    submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
      WHERE pilot_programs.company_id IN (
        SELECT company_id FROM users
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    )
  );

-- 5. Drop existing policies for gasifier_observations
DROP POLICY IF EXISTS "gasifier_observations_policy" ON "public"."gasifier_observations";

-- Create new policy for gasifier_observations that only allows access to observations from submissions in sites in programs in user's company
CREATE POLICY "gasifier_observations_policy" ON gasifier_observations
  FOR SELECT
  TO public
  USING (
    submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
      WHERE pilot_programs.company_id IN (
        SELECT company_id FROM users
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    )
  );

-- 6. Add comments for documentation
COMMENT ON POLICY "pilot_programs_policy" ON pilot_programs IS 'Allows users to view only programs that belong to their own company';
COMMENT ON POLICY "sites_policy" ON sites IS 'Allows users to view only sites that belong to programs from their own company';
COMMENT ON POLICY "submissions_policy" ON submissions IS 'Allows users to view only submissions that belong to sites from programs from their own company';
COMMENT ON POLICY "petri_observations_policy" ON petri_observations IS 'Allows users to view only petri observations that belong to submissions from sites from programs from their own company';
COMMENT ON POLICY "gasifier_observations_policy" ON gasifier_observations IS 'Allows users to view only gasifier observations that belong to submissions from sites from programs from their own company';