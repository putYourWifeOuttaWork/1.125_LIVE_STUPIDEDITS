/*
  FIX: Sites RLS Policies

  Problem: The RLS policies on sites table are causing 400 errors,
  likely due to complex joins in the policy conditions.

  Solution: Simplify the RLS policies to use helper functions instead of inline JOINs
*/

-- Drop existing SELECT policies on sites
DROP POLICY IF EXISTS "Super admins can view all sites" ON sites;
DROP POLICY IF EXISTS "Company admins can view company sites" ON sites;
DROP POLICY IF EXISTS "Users can view sites in accessible programs" ON sites;

-- Recreate with simpler logic using helper functions
CREATE POLICY "Super admins can view all sites"
ON sites
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Company admins can view company sites"
ON sites
FOR SELECT
TO authenticated
USING (
  is_company_admin()
  AND sites.company_id = get_user_company_id()
);

CREATE POLICY "Users can view sites in accessible programs"
ON sites
FOR SELECT
TO authenticated
USING (
  sites.company_id = get_user_company_id()
  AND EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.user_id = auth.uid()
      AND ppu.program_id = sites.program_id
  )
);

SELECT 'Sites RLS policies fixed!' as status;
