/*
  # Fix RLS Policies with Direct Subqueries

  1. Purpose
    - Replace RLS helper function calls with direct subqueries
    - Ensure RLS policies work reliably with authenticated sessions
    - Fix issue where company admins cannot see their programs

  2. Problem
    - Helper functions like get_user_company_id() and user_is_company_admin()
      may not resolve correctly in all contexts
    - This causes company admins to be unable to see their programs

  3. Solution
    - Rewrite SELECT policies to use direct subqueries against users table
    - Keep the same access model but make it more reliable
    - Inline the logic instead of relying on SECURITY DEFINER functions

  4. Access Model (Unchanged)
    - Super admins: Full access to all companies
    - Company admins: Full access to their company's data
    - Regular users: Must have explicit program access via pilot_program_users
*/

-- ==========================================
-- PILOT_PROGRAMS TABLE - IMPROVED RLS
-- ==========================================

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Super admins can view all programs" ON pilot_programs;
DROP POLICY IF EXISTS "Company admins can view company programs" ON pilot_programs;
DROP POLICY IF EXISTS "Users can view programs with explicit access" ON pilot_programs;

-- Recreate SELECT policies with direct subqueries
CREATE POLICY "Super admins can view all programs"
ON pilot_programs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_super_admin = true
  )
);

CREATE POLICY "Company admins can view company programs"
ON pilot_programs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_company_admin = true
      AND users.company_id IS NOT NULL
      AND pilot_programs.company_id = users.company_id
  )
);

CREATE POLICY "Users can view programs with explicit access"
ON pilot_programs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    JOIN pilot_program_users ppu ON ppu.user_id = users.id
    WHERE users.id = auth.uid()
      AND ppu.program_id = pilot_programs.program_id
      AND pilot_programs.company_id = users.company_id
  )
);

-- ==========================================
-- SITES TABLE - IMPROVED RLS
-- ==========================================

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Super admins can view all sites" ON sites;
DROP POLICY IF EXISTS "Users can view sites in accessible programs" ON sites;

-- Recreate SELECT policies with direct subqueries
CREATE POLICY "Super admins can view all sites"
ON sites
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_super_admin = true
  )
);

CREATE POLICY "Company admins can view company sites"
ON sites
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_company_admin = true
      AND users.company_id IS NOT NULL
      AND sites.company_id = users.company_id
  )
);

CREATE POLICY "Users can view sites in accessible programs"
ON sites
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    JOIN pilot_program_users ppu ON ppu.user_id = users.id
    WHERE users.id = auth.uid()
      AND ppu.program_id = sites.program_id
      AND sites.company_id = users.company_id
  )
);

-- ==========================================
-- SUBMISSIONS TABLE - IMPROVED RLS
-- ==========================================

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Super admins can view all submissions" ON submissions;
DROP POLICY IF EXISTS "Users can view submissions in accessible programs" ON submissions;

-- Recreate SELECT policies with direct subqueries
CREATE POLICY "Super admins can view all submissions"
ON submissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_super_admin = true
  )
);

CREATE POLICY "Company admins can view company submissions"
ON submissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_company_admin = true
      AND users.company_id IS NOT NULL
      AND submissions.company_id = users.company_id
  )
);

CREATE POLICY "Users can view submissions in accessible programs"
ON submissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    JOIN pilot_program_users ppu ON ppu.user_id = users.id
    WHERE users.id = auth.uid()
      AND ppu.program_id = submissions.program_id
      AND submissions.company_id = users.company_id
  )
);

-- ==========================================
-- PETRI_OBSERVATIONS TABLE - IMPROVED RLS
-- ==========================================

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Super admins can view all petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Users can view petri observations in accessible programs" ON petri_observations;

-- Recreate SELECT policies with direct subqueries
CREATE POLICY "Super admins can view all petri observations"
ON petri_observations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_super_admin = true
  )
);

CREATE POLICY "Company admins can view company petri observations"
ON petri_observations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_company_admin = true
      AND users.company_id IS NOT NULL
      AND petri_observations.company_id = users.company_id
  )
);

CREATE POLICY "Users can view petri observations in accessible programs"
ON petri_observations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    JOIN pilot_program_users ppu ON ppu.user_id = users.id
    WHERE users.id = auth.uid()
      AND ppu.program_id = petri_observations.program_id
      AND petri_observations.company_id = users.company_id
  )
);

-- ==========================================
-- GASIFIER_OBSERVATIONS TABLE - IMPROVED RLS
-- ==========================================

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Super admins can view all gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Users can view gasifier observations in accessible programs" ON gasifier_observations;

-- Recreate SELECT policies with direct subqueries
CREATE POLICY "Super admins can view all gasifier observations"
ON gasifier_observations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_super_admin = true
  )
);

CREATE POLICY "Company admins can view company gasifier observations"
ON gasifier_observations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_company_admin = true
      AND users.company_id IS NOT NULL
      AND gasifier_observations.company_id = users.company_id
  )
);

CREATE POLICY "Users can view gasifier observations in accessible programs"
ON gasifier_observations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    JOIN pilot_program_users ppu ON ppu.user_id = users.id
    WHERE users.id = auth.uid()
      AND ppu.program_id = gasifier_observations.program_id
      AND gasifier_observations.company_id = users.company_id
  )
);

-- Add indexes to improve RLS policy performance
CREATE INDEX IF NOT EXISTS idx_users_auth_lookup
ON users(id, company_id, is_company_admin, is_super_admin);

CREATE INDEX IF NOT EXISTS idx_pilot_program_users_lookup
ON pilot_program_users(user_id, program_id);

-- Add comments for documentation
COMMENT ON POLICY "Super admins can view all programs" ON pilot_programs
IS 'Super admins have unrestricted access to all programs across all companies';

COMMENT ON POLICY "Company admins can view company programs" ON pilot_programs
IS 'Company admins can view all programs within their company';

COMMENT ON POLICY "Users can view programs with explicit access" ON pilot_programs
IS 'Regular users can only view programs they have explicit access to via pilot_program_users table';
