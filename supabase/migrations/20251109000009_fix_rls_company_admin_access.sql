/*
  # Fix RLS Policies for Company Admin Access

  1. Purpose
    - Fix RLS policies to allow company admins to see all company data
    - Remove requirement for explicit pilot_program_users entries for admins
    - Change logic from AND to OR for company admin checks

  2. Current Problem
    - Company admins require BOTH company match AND explicit program access
    - This defeats the purpose of company-level admin privileges

  3. Solution
    - Separate policies for different access levels
    - Company admins see all data in their company (no explicit access needed)
    - Regular users need explicit program access within their company
    - Super admins see everything

  4. Tables Updated
    - pilot_programs
    - sites
    - submissions
    - petri_observations
    - gasifier_observations
*/

-- ==========================================
-- PILOT_PROGRAMS TABLE - FIXED RLS
-- ==========================================

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Super admins can view all programs" ON pilot_programs;
DROP POLICY IF EXISTS "Company admins can view company programs" ON pilot_programs;
DROP POLICY IF EXISTS "Users can view programs with explicit access" ON pilot_programs;

-- Recreate SELECT policies with correct logic
-- Policy 1: Super admins see everything
CREATE POLICY "Super admins can view all programs"
ON pilot_programs
FOR SELECT
TO authenticated
USING (is_super_admin());

-- Policy 2: Company admins see all programs in their company (NO explicit access needed)
CREATE POLICY "Company admins can view company programs"
ON pilot_programs
FOR SELECT
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- Policy 3: Regular users see programs with explicit access AND matching company
CREATE POLICY "Users can view programs with explicit access"
ON pilot_programs
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND NOT user_is_company_admin() -- Don't apply this policy to admins
);

-- ==========================================
-- SITES TABLE - FIXED RLS
-- ==========================================

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Super admins can view all sites" ON sites;
DROP POLICY IF EXISTS "Users can view sites in accessible programs" ON sites;
DROP POLICY IF EXISTS "Company admins can view company sites" ON sites;

-- Recreate SELECT policies with correct logic
-- Policy 1: Super admins see everything
CREATE POLICY "Super admins can view all sites"
ON sites
FOR SELECT
TO authenticated
USING (is_super_admin());

-- Policy 2: Company admins see all sites in their company
CREATE POLICY "Company admins can view company sites"
ON sites
FOR SELECT
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- Policy 3: Regular users see sites in accessible programs
CREATE POLICY "Users can view sites in accessible programs"
ON sites
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND NOT user_is_company_admin()
);

-- ==========================================
-- SUBMISSIONS TABLE - FIXED RLS
-- ==========================================

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Super admins can view all submissions" ON submissions;
DROP POLICY IF EXISTS "Users can view submissions in accessible programs" ON submissions;
DROP POLICY IF EXISTS "Company admins can view company submissions" ON submissions;

-- Recreate SELECT policies with correct logic
-- Policy 1: Super admins see everything
CREATE POLICY "Super admins can view all submissions"
ON submissions
FOR SELECT
TO authenticated
USING (is_super_admin());

-- Policy 2: Company admins see all submissions in their company
CREATE POLICY "Company admins can view company submissions"
ON submissions
FOR SELECT
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- Policy 3: Regular users see submissions in accessible programs
CREATE POLICY "Users can view submissions in accessible programs"
ON submissions
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND NOT user_is_company_admin()
);

-- ==========================================
-- PETRI_OBSERVATIONS TABLE - FIXED RLS
-- ==========================================

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Super admins can view all petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Users can view petri observations in accessible programs" ON petri_observations;
DROP POLICY IF EXISTS "Company admins can view company petri observations" ON petri_observations;

-- Recreate SELECT policies with correct logic
-- Policy 1: Super admins see everything
CREATE POLICY "Super admins can view all petri observations"
ON petri_observations
FOR SELECT
TO authenticated
USING (is_super_admin());

-- Policy 2: Company admins see all petri observations in their company
CREATE POLICY "Company admins can view company petri observations"
ON petri_observations
FOR SELECT
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- Policy 3: Regular users see petri observations in accessible programs
CREATE POLICY "Users can view petri observations in accessible programs"
ON petri_observations
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND NOT user_is_company_admin()
);

-- ==========================================
-- GASIFIER_OBSERVATIONS TABLE - FIXED RLS
-- ==========================================

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Super admins can view all gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Users can view gasifier observations in accessible programs" ON gasifier_observations;
DROP POLICY IF EXISTS "Company admins can view company gasifier observations" ON gasifier_observations;

-- Recreate SELECT policies with correct logic
-- Policy 1: Super admins see everything
CREATE POLICY "Super admins can view all gasifier observations"
ON gasifier_observations
FOR SELECT
TO authenticated
USING (is_super_admin());

-- Policy 2: Company admins see all gasifier observations in their company
CREATE POLICY "Company admins can view company gasifier observations"
ON gasifier_observations
FOR SELECT
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- Policy 3: Regular users see gasifier observations in accessible programs
CREATE POLICY "Users can view gasifier observations in accessible programs"
ON gasifier_observations
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND NOT user_is_company_admin()
);

-- Add comments explaining the fix
COMMENT ON POLICY "Company admins can view company programs" ON pilot_programs IS 'Company admins can see all programs in their company without needing explicit pilot_program_users entries';
COMMENT ON POLICY "Company admins can view company sites" ON sites IS 'Company admins can see all sites in their company without needing explicit program access';
COMMENT ON POLICY "Company admins can view company submissions" ON submissions IS 'Company admins can see all submissions in their company without needing explicit program access';
COMMENT ON POLICY "Company admins can view company petri observations" ON petri_observations IS 'Company admins can see all petri observations in their company without needing explicit program access';
COMMENT ON POLICY "Company admins can view company gasifier observations" ON gasifier_observations IS 'Company admins can see all gasifier observations in their company without needing explicit program access';
