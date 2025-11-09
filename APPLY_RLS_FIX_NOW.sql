/*
  Quick RLS Fix for Matt's Program Access

  This script fixes the RLS policies so company admins (like Matt) can see their programs.
  Run this in the Supabase SQL Editor.
*/

-- ==========================================
-- PILOT_PROGRAMS TABLE - Fix RLS
-- ==========================================

-- Drop ALL existing SELECT policies on pilot_programs
DROP POLICY IF EXISTS "Super admins can view all programs" ON pilot_programs;
DROP POLICY IF EXISTS "Company admins can view company programs" ON pilot_programs;
DROP POLICY IF EXISTS "Users can view programs with explicit access" ON pilot_programs;

-- Recreate with direct subqueries (more reliable)
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
-- SITES TABLE - Fix RLS
-- ==========================================

-- Drop ALL existing SELECT policies on sites
DROP POLICY IF EXISTS "Super admins can view all sites" ON sites;
DROP POLICY IF EXISTS "Company admins can view company sites" ON sites;
DROP POLICY IF EXISTS "Users can view sites in accessible programs" ON sites;

-- Recreate with direct subqueries
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
-- SUBMISSIONS TABLE - Fix RLS
-- ==========================================

-- Drop ALL existing SELECT policies on submissions
DROP POLICY IF EXISTS "Super admins can view all submissions" ON submissions;
DROP POLICY IF EXISTS "Company admins can view company submissions" ON submissions;
DROP POLICY IF EXISTS "Users can view submissions in accessible programs" ON submissions;

-- Recreate with direct subqueries
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
-- PETRI_OBSERVATIONS TABLE - Fix RLS
-- ==========================================

-- Drop ALL existing SELECT policies on petri_observations
DROP POLICY IF EXISTS "Super admins can view all petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Company admins can view company petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Users can view petri observations in accessible programs" ON petri_observations;

-- Recreate with direct subqueries
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
-- GASIFIER_OBSERVATIONS TABLE - Fix RLS
-- ==========================================

-- Drop ALL existing SELECT policies on gasifier_observations
DROP POLICY IF EXISTS "Super admins can view all gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Company admins can view company gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Users can view gasifier observations in accessible programs" ON gasifier_observations;

-- Recreate with direct subqueries
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

-- ==========================================
-- PERFORMANCE INDEXES
-- ==========================================

-- Add indexes for faster RLS checks
CREATE INDEX IF NOT EXISTS idx_users_auth_lookup
ON users(id, company_id, is_company_admin, is_super_admin);

CREATE INDEX IF NOT EXISTS idx_pilot_program_users_lookup
ON pilot_program_users(user_id, program_id);

-- Done!
SELECT 'RLS policies updated successfully!' as status;
