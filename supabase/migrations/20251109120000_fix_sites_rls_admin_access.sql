/*
  # Fix Sites RLS Policies for Admin Access

  1. Purpose
    - Fix site visibility for company admins and super admins
    - Simplify RLS logic: if you can see the program, you can see its sites
    - Remove redundant company_id checks that block admin access

  2. Problem
    - Current policies require BOTH company_id match AND explicit program access
    - Company admins should see all sites in their company's programs
    - Super admins should see all sites across all companies
    - Current restrictive policies block admin access unnecessarily

  3. Solution
    - Super admins: See all sites (no restrictions)
    - Company admins: See sites in programs owned by their company
    - Regular users: See sites in programs they have explicit access to
    - Remove redundant company_id checks on sites table

  4. Access Model
    - If you can access the program (via pilot_programs RLS), you can access its sites
    - Leverage existing program-level access control
    - Simplify and make policies more maintainable
*/

-- ==========================================
-- DROP EXISTING SITES SELECT POLICIES
-- ==========================================

DROP POLICY IF EXISTS "Super admins can view all sites" ON sites;
DROP POLICY IF EXISTS "Company admins can view company sites" ON sites;
DROP POLICY IF EXISTS "Users can view sites in accessible programs" ON sites;

-- ==========================================
-- CREATE SIMPLIFIED SITES SELECT POLICIES
-- ==========================================

-- Policy 1: Super admins can view all sites
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

-- Policy 2: Company admins can view sites in their company's programs
-- Check if the site's program belongs to the admin's company
CREATE POLICY "Company admins can view company sites"
ON sites
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users u
    JOIN pilot_programs pp ON pp.company_id = u.company_id
    WHERE u.id = auth.uid()
      AND u.is_company_admin = true
      AND u.company_id IS NOT NULL
      AND sites.program_id = pp.program_id
  )
);

-- Policy 3: Regular users can view sites in programs they have explicit access to
CREATE POLICY "Users can view sites in accessible programs"
ON sites
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.user_id = auth.uid()
      AND ppu.program_id = sites.program_id
  )
);

-- ==========================================
-- UPDATE INSERT/UPDATE/DELETE POLICIES
-- ==========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Super admins can create sites" ON sites;
DROP POLICY IF EXISTS "Company users can create sites in accessible programs" ON sites;

-- Recreate INSERT policies
CREATE POLICY "Super admins can create sites"
ON sites
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_super_admin = true
  )
);

CREATE POLICY "Users can create sites in accessible programs"
ON sites
FOR INSERT
TO authenticated
WITH CHECK (
  -- Must have program access
  EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.user_id = auth.uid()
      AND ppu.program_id = sites.program_id
      AND ppu.role IN ('Admin', 'Edit')
  )
  OR
  -- OR be company admin for the program
  EXISTS (
    SELECT 1
    FROM users u
    JOIN pilot_programs pp ON pp.company_id = u.company_id
    WHERE u.id = auth.uid()
      AND u.is_company_admin = true
      AND sites.program_id = pp.program_id
  )
);

-- Drop existing UPDATE policies
DROP POLICY IF EXISTS "Super admins can update all sites" ON sites;
DROP POLICY IF EXISTS "Admins and editors can update sites" ON sites;

-- Recreate UPDATE policies
CREATE POLICY "Super admins can update all sites"
ON sites
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_super_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_super_admin = true
  )
);

CREATE POLICY "Users can update sites in accessible programs"
ON sites
FOR UPDATE
TO authenticated
USING (
  -- Can update if has program access with Admin/Edit role
  EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.user_id = auth.uid()
      AND ppu.program_id = sites.program_id
      AND ppu.role IN ('Admin', 'Edit')
  )
  OR
  -- OR is company admin for the program
  EXISTS (
    SELECT 1
    FROM users u
    JOIN pilot_programs pp ON pp.company_id = u.company_id
    WHERE u.id = auth.uid()
      AND u.is_company_admin = true
      AND sites.program_id = pp.program_id
  )
)
WITH CHECK (
  -- Same check for WITH CHECK
  EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.user_id = auth.uid()
      AND ppu.program_id = sites.program_id
      AND ppu.role IN ('Admin', 'Edit')
  )
  OR
  EXISTS (
    SELECT 1
    FROM users u
    JOIN pilot_programs pp ON pp.company_id = u.company_id
    WHERE u.id = auth.uid()
      AND u.is_company_admin = true
      AND sites.program_id = pp.program_id
  )
);

-- Drop existing DELETE policies
DROP POLICY IF EXISTS "Super admins can delete all sites" ON sites;
DROP POLICY IF EXISTS "Admins and editors can delete sites" ON sites;

-- Recreate DELETE policies
CREATE POLICY "Super admins can delete all sites"
ON sites
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_super_admin = true
  )
);

CREATE POLICY "Users can delete sites in accessible programs"
ON sites
FOR DELETE
TO authenticated
USING (
  -- Can delete if has program access with Admin/Edit role
  EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.user_id = auth.uid()
      AND ppu.program_id = sites.program_id
      AND ppu.role IN ('Admin', 'Edit')
  )
  OR
  -- OR is company admin for the program
  EXISTS (
    SELECT 1
    FROM users u
    JOIN pilot_programs pp ON pp.company_id = u.company_id
    WHERE u.id = auth.uid()
      AND u.is_company_admin = true
      AND sites.program_id = pp.program_id
  )
);

-- ==========================================
-- ADD HELPFUL COMMENTS
-- ==========================================

COMMENT ON POLICY "Super admins can view all sites" ON sites
IS 'Super admins have unrestricted access to view all sites across all companies';

COMMENT ON POLICY "Company admins can view company sites" ON sites
IS 'Company admins can view all sites in programs owned by their company, without needing explicit pilot_program_users entries';

COMMENT ON POLICY "Users can view sites in accessible programs" ON sites
IS 'Regular users can view sites in programs they have explicit access to via pilot_program_users table';

-- Success message
SELECT 'Sites RLS policies updated - admin access restored!' as status;
