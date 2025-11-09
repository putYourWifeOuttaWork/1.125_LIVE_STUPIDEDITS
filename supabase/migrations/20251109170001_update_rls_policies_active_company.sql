/*
  # Update RLS Policies to Use Active Company Context

  1. Purpose
    - Replace get_user_company_id() with get_active_company_id() in all RLS policies
    - Enforce strict single-company-at-a-time access model
    - Remove any cross-company access paths
    - Simplify policies by removing pilot_program_users requirement for company admins

  2. Tables Updated
    - pilot_programs
    - sites
    - submissions
    - petri_observations
    - gasifier_observations

  3. Key Changes
    - All SELECT policies now use get_active_company_id() instead of get_user_company_id()
    - Company admins see all data in their active company without explicit program assignments
    - Regular users must have program assignments AND company match
    - Super admins see only data from their selected company context
    - No cross-company visibility under any circumstances

  4. Access Model
    - Super admins: Full CRUD in selected company only
    - Company admins: Full CRUD in their assigned company only
    - Regular users: Limited to explicitly assigned programs in their company only
*/

-- ==========================================
-- PILOT_PROGRAMS TABLE - UPDATE RLS POLICIES
-- ==========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Super admins can view all programs" ON pilot_programs;
DROP POLICY IF EXISTS "Company admins can view company programs" ON pilot_programs;
DROP POLICY IF EXISTS "Users can view programs with explicit access" ON pilot_programs;
DROP POLICY IF EXISTS "Super admins can create programs" ON pilot_programs;
DROP POLICY IF EXISTS "Authenticated users can create programs" ON pilot_programs;
DROP POLICY IF EXISTS "Company admins can create programs in their company" ON pilot_programs;
DROP POLICY IF EXISTS "Super admins can update all programs" ON pilot_programs;
DROP POLICY IF EXISTS "Company admins can update company programs" ON pilot_programs;
DROP POLICY IF EXISTS "Program admins can update programs" ON pilot_programs;
DROP POLICY IF EXISTS "Super admins can delete all programs" ON pilot_programs;
DROP POLICY IF EXISTS "Company admins can delete company programs" ON pilot_programs;

-- NEW SELECT POLICIES - Strict company context enforcement

-- Super admins see only programs in their active company context
CREATE POLICY "Super admins view active company programs"
  ON pilot_programs
  FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

-- Company admins see all programs in their company (no explicit assignment needed)
CREATE POLICY "Company admins view all company programs"
  ON pilot_programs
  FOR SELECT
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

-- Regular users see only programs they have explicit access to in their company
CREATE POLICY "Regular users view assigned programs only"
  ON pilot_programs
  FOR SELECT
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
  );

-- NEW INSERT POLICIES

CREATE POLICY "Super admins create programs in active company"
  ON pilot_programs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins create programs in their company"
  ON pilot_programs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

-- NEW UPDATE POLICIES

CREATE POLICY "Super admins update programs in active company"
  ON pilot_programs
  FOR UPDATE
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  )
  WITH CHECK (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins update programs in their company"
  ON pilot_programs
  FOR UPDATE
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  )
  WITH CHECK (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Program admins update assigned programs"
  ON pilot_programs
  FOR UPDATE
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
    AND EXISTS (
      SELECT 1 FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = pilot_programs.program_id
        AND role = 'Admin'
    )
  )
  WITH CHECK (
    company_id = get_active_company_id()
  );

-- NEW DELETE POLICIES

CREATE POLICY "Super admins delete programs in active company"
  ON pilot_programs
  FOR DELETE
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins delete programs in their company"
  ON pilot_programs
  FOR DELETE
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

-- ==========================================
-- SITES TABLE - UPDATE RLS POLICIES
-- ==========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Super admins can view all sites" ON sites;
DROP POLICY IF EXISTS "Users can view sites in accessible programs" ON sites;
DROP POLICY IF EXISTS "Super admins can create sites" ON sites;
DROP POLICY IF EXISTS "Company users can create sites in accessible programs" ON sites;
DROP POLICY IF EXISTS "Super admins can update all sites" ON sites;
DROP POLICY IF EXISTS "Admins and editors can update sites" ON sites;
DROP POLICY IF EXISTS "Super admins can delete all sites" ON sites;
DROP POLICY IF EXISTS "Admins and editors can delete sites" ON sites;

-- NEW SELECT POLICIES

CREATE POLICY "Super admins view sites in active company"
  ON sites
  FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins view all company sites"
  ON sites
  FOR SELECT
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Regular users view sites in assigned programs"
  ON sites
  FOR SELECT
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
  );

-- NEW INSERT POLICIES

CREATE POLICY "Super admins create sites in active company"
  ON sites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins create sites in their company"
  ON sites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Program editors create sites in assigned programs"
  ON sites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
    AND EXISTS (
      SELECT 1 FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = sites.program_id
        AND role IN ('Admin', 'Edit')
    )
  );

-- NEW UPDATE POLICIES

CREATE POLICY "Super admins update sites in active company"
  ON sites
  FOR UPDATE
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  )
  WITH CHECK (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins update sites in their company"
  ON sites
  FOR UPDATE
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  )
  WITH CHECK (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Program editors update sites in assigned programs"
  ON sites
  FOR UPDATE
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
    AND EXISTS (
      SELECT 1 FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = sites.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
  WITH CHECK (
    company_id = get_active_company_id()
  );

-- NEW DELETE POLICIES

CREATE POLICY "Super admins delete sites in active company"
  ON sites
  FOR DELETE
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins delete sites in their company"
  ON sites
  FOR DELETE
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Program editors delete sites in assigned programs"
  ON sites
  FOR DELETE
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
    AND EXISTS (
      SELECT 1 FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = sites.program_id
        AND role IN ('Admin', 'Edit')
    )
  );

-- ==========================================
-- SUBMISSIONS TABLE - UPDATE RLS POLICIES
-- ==========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Super admins can view all submissions" ON submissions;
DROP POLICY IF EXISTS "Users can view submissions in accessible programs" ON submissions;
DROP POLICY IF EXISTS "Super admins can create submissions" ON submissions;
DROP POLICY IF EXISTS "Users can create submissions in accessible programs" ON submissions;
DROP POLICY IF EXISTS "Super admins can update all submissions" ON submissions;
DROP POLICY IF EXISTS "Admins and editors can update submissions" ON submissions;
DROP POLICY IF EXISTS "Super admins can delete all submissions" ON submissions;
DROP POLICY IF EXISTS "Admins and editors can delete submissions" ON submissions;

-- NEW SELECT POLICIES

CREATE POLICY "Super admins view submissions in active company"
  ON submissions
  FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins view all company submissions"
  ON submissions
  FOR SELECT
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Regular users view submissions in assigned programs"
  ON submissions
  FOR SELECT
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
  );

-- NEW INSERT POLICIES

CREATE POLICY "Super admins create submissions in active company"
  ON submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins create submissions in their company"
  ON submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Program users create submissions in assigned programs"
  ON submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
  );

-- NEW UPDATE POLICIES

CREATE POLICY "Super admins update submissions in active company"
  ON submissions
  FOR UPDATE
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  )
  WITH CHECK (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins update submissions in their company"
  ON submissions
  FOR UPDATE
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  )
  WITH CHECK (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Program editors update submissions in assigned programs"
  ON submissions
  FOR UPDATE
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
    AND EXISTS (
      SELECT 1 FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = submissions.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
  WITH CHECK (
    company_id = get_active_company_id()
  );

-- NEW DELETE POLICIES

CREATE POLICY "Super admins delete submissions in active company"
  ON submissions
  FOR DELETE
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins delete submissions in their company"
  ON submissions
  FOR DELETE
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Program editors delete submissions in assigned programs"
  ON submissions
  FOR DELETE
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
    AND EXISTS (
      SELECT 1 FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = submissions.program_id
        AND role IN ('Admin', 'Edit')
    )
  );

-- ==========================================
-- PETRI_OBSERVATIONS TABLE - UPDATE RLS POLICIES
-- ==========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Super admins can view all petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Users can view petri observations in accessible programs" ON petri_observations;
DROP POLICY IF EXISTS "Super admins can create petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Users can create petri observations in accessible programs" ON petri_observations;
DROP POLICY IF EXISTS "Super admins can update all petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Admins and editors can update petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Super admins can delete all petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Admins and editors can delete petri observations" ON petri_observations;

-- NEW SELECT POLICIES

CREATE POLICY "Super admins view petri observations in active company"
  ON petri_observations
  FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins view all company petri observations"
  ON petri_observations
  FOR SELECT
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Regular users view petri observations in assigned programs"
  ON petri_observations
  FOR SELECT
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
  );

-- NEW INSERT POLICIES

CREATE POLICY "Super admins create petri observations in active company"
  ON petri_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins create petri observations in their company"
  ON petri_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Program users create petri observations in assigned programs"
  ON petri_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
  );

-- NEW UPDATE POLICIES

CREATE POLICY "Super admins update petri observations in active company"
  ON petri_observations
  FOR UPDATE
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  )
  WITH CHECK (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins update petri observations in their company"
  ON petri_observations
  FOR UPDATE
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  )
  WITH CHECK (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Program editors update petri observations in assigned programs"
  ON petri_observations
  FOR UPDATE
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
    AND EXISTS (
      SELECT 1 FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = petri_observations.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
  WITH CHECK (
    company_id = get_active_company_id()
  );

-- NEW DELETE POLICIES

CREATE POLICY "Super admins delete petri observations in active company"
  ON petri_observations
  FOR DELETE
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins delete petri observations in their company"
  ON petri_observations
  FOR DELETE
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Program editors delete petri observations in assigned programs"
  ON petri_observations
  FOR DELETE
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
    AND EXISTS (
      SELECT 1 FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = petri_observations.program_id
        AND role IN ('Admin', 'Edit')
    )
  );

-- ==========================================
-- GASIFIER_OBSERVATIONS TABLE - UPDATE RLS POLICIES
-- ==========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Super admins can view all gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Users can view gasifier observations in accessible programs" ON gasifier_observations;
DROP POLICY IF EXISTS "Super admins can create gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Users can create gasifier observations in accessible programs" ON gasifier_observations;
DROP POLICY IF EXISTS "Super admins can update all gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Admins and editors can update gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Super admins can delete all gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Admins and editors can delete gasifier observations" ON gasifier_observations;

-- NEW SELECT POLICIES

CREATE POLICY "Super admins view gasifier observations in active company"
  ON gasifier_observations
  FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins view all company gasifier observations"
  ON gasifier_observations
  FOR SELECT
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Regular users view gasifier observations in assigned programs"
  ON gasifier_observations
  FOR SELECT
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
  );

-- NEW INSERT POLICIES

CREATE POLICY "Super admins create gasifier observations in active company"
  ON gasifier_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins create gasifier observations in their company"
  ON gasifier_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Program users create gasifier observations in assigned programs"
  ON gasifier_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
  );

-- NEW UPDATE POLICIES

CREATE POLICY "Super admins update gasifier observations in active company"
  ON gasifier_observations
  FOR UPDATE
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  )
  WITH CHECK (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins update gasifier observations in their company"
  ON gasifier_observations
  FOR UPDATE
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  )
  WITH CHECK (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Program editors update gasifier observations in assigned programs"
  ON gasifier_observations
  FOR UPDATE
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
    AND EXISTS (
      SELECT 1 FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = gasifier_observations.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
  WITH CHECK (
    company_id = get_active_company_id()
  );

-- NEW DELETE POLICIES

CREATE POLICY "Super admins delete gasifier observations in active company"
  ON gasifier_observations
  FOR DELETE
  TO authenticated
  USING (
    is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Company admins delete gasifier observations in their company"
  ON gasifier_observations
  FOR DELETE
  TO authenticated
  USING (
    user_is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()
  );

CREATE POLICY "Program editors delete gasifier observations in assigned programs"
  ON gasifier_observations
  FOR DELETE
  TO authenticated
  USING (
    NOT is_super_admin()
    AND NOT user_is_company_admin()
    AND company_id = get_active_company_id()
    AND user_has_program_access(program_id)
    AND EXISTS (
      SELECT 1 FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = gasifier_observations.program_id
        AND role IN ('Admin', 'Edit')
    )
  );

-- ==========================================
-- ADD COMMENTS
-- ==========================================

COMMENT ON POLICY "Super admins view active company programs" ON pilot_programs IS 'Super admins can only view programs in their currently selected company context';
COMMENT ON POLICY "Company admins view all company programs" ON pilot_programs IS 'Company admins see all programs in their company without needing explicit assignments';
COMMENT ON POLICY "Regular users view assigned programs only" ON pilot_programs IS 'Regular users must have explicit program access via pilot_program_users table';
