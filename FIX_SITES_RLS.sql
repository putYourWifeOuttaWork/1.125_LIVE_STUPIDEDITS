/*
  FIX: Sites RLS Policies - Simplified

  New Rule: Sites should be visible to any user who has access to the parent program.
  No other authorization checks needed.

  This means:
  - If you can see the program, you can see its sites
  - No company_id checks on sites
  - No role checks on sites
  - Just: Do you have access to the program? Then you can see the sites.
*/

-- Drop ALL existing policies on sites
DROP POLICY IF EXISTS "Super admins can view all sites" ON sites;
DROP POLICY IF EXISTS "Company admins can view company sites" ON sites;
DROP POLICY IF EXISTS "Users can view sites in accessible programs" ON sites;
DROP POLICY IF EXISTS "Super admins can create sites" ON sites;
DROP POLICY IF EXISTS "Company users can create sites in accessible programs" ON sites;
DROP POLICY IF EXISTS "Super admins can update all sites" ON sites;
DROP POLICY IF EXISTS "Admins and editors can update sites" ON sites;
DROP POLICY IF EXISTS "Super admins can delete all sites" ON sites;
DROP POLICY IF EXISTS "Admins and editors can delete sites" ON sites;

-- SELECT: If you can access the program, you can view its sites
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
  OR is_super_admin()
);

-- INSERT: If you can access the program, you can create sites in it
CREATE POLICY "Users can create sites in accessible programs"
ON sites
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.user_id = auth.uid()
      AND ppu.program_id = sites.program_id
  )
  OR is_super_admin()
);

-- UPDATE: If you can access the program, you can update its sites
CREATE POLICY "Users can update sites in accessible programs"
ON sites
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.user_id = auth.uid()
      AND ppu.program_id = sites.program_id
  )
  OR is_super_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.user_id = auth.uid()
      AND ppu.program_id = sites.program_id
  )
  OR is_super_admin()
);

-- DELETE: If you can access the program, you can delete its sites
CREATE POLICY "Users can delete sites in accessible programs"
ON sites
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.user_id = auth.uid()
      AND ppu.program_id = sites.program_id
  )
  OR is_super_admin()
);

SELECT 'Sites RLS policies simplified - program access only!' as status;
