/*
  # Row-Level Security Policies for Core Tables

  1. Purpose
    - Implement company-based multi-tenancy with RLS
    - Super admins have unrestricted access to all data
    - Company admins can manage all data within their company
    - Regular users see their company's programs + explicit program access
    - Enforce data isolation between companies

  2. Tables with RLS Policies
    - pilot_programs
    - sites
    - submissions
    - petri_observations
    - gasifier_observations

  3. Access Model (Hybrid)
    - Super admins: Full access to all companies
    - Company admins: Full access to their company's data
    - Regular company users: Must have explicit program access via pilot_program_users
    - Users see only data from their company (unless super admin)

  4. Helper Functions
    - is_super_admin(): Check if user is super admin
    - get_user_company_id(): Get user's company_id
    - user_has_program_access(program_id): Check if user has explicit program access
    - user_is_company_admin(): Check if user is company admin
*/

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM users
    WHERE id = auth.uid()
      AND is_super_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get user's company_id
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id
  FROM users
  WHERE id = auth.uid();

  RETURN v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if user has program access
CREATE OR REPLACE FUNCTION user_has_program_access(p_program_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM pilot_program_users
    WHERE user_id = auth.uid()
      AND program_id = p_program_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if user is company admin
CREATE OR REPLACE FUNCTION user_is_company_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM users
    WHERE id = auth.uid()
      AND is_company_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if user is company admin for specific program
CREATE OR REPLACE FUNCTION user_is_company_admin_for_program(p_program_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM users u
    JOIN pilot_programs pp ON u.company_id = pp.company_id
    WHERE u.id = auth.uid()
      AND u.is_company_admin = true
      AND pp.program_id = p_program_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==========================================
-- PILOT_PROGRAMS TABLE RLS
-- ==========================================

-- Enable RLS on pilot_programs
ALTER TABLE pilot_programs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all programs" ON pilot_programs;
DROP POLICY IF EXISTS "Company admins can view company programs" ON pilot_programs;
DROP POLICY IF EXISTS "Users can view programs with explicit access" ON pilot_programs;
DROP POLICY IF EXISTS "Super admins can create programs" ON pilot_programs;
DROP POLICY IF EXISTS "Company admins can create programs in their company" ON pilot_programs;
DROP POLICY IF EXISTS "Authenticated users can create programs" ON pilot_programs;
DROP POLICY IF EXISTS "Super admins can update all programs" ON pilot_programs;
DROP POLICY IF EXISTS "Company admins can update company programs" ON pilot_programs;
DROP POLICY IF EXISTS "Program admins can update programs" ON pilot_programs;
DROP POLICY IF EXISTS "Super admins can delete all programs" ON pilot_programs;
DROP POLICY IF EXISTS "Company admins can delete company programs" ON pilot_programs;
DROP POLICY IF EXISTS "pilot_programs_insert" ON pilot_programs;

-- SELECT policies
CREATE POLICY "Super admins can view all programs"
ON pilot_programs
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Company admins can view company programs"
ON pilot_programs
FOR SELECT
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

CREATE POLICY "Users can view programs with explicit access"
ON pilot_programs
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
);

-- INSERT policies
CREATE POLICY "Super admins can create programs"
ON pilot_programs
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Authenticated users can create programs"
ON pilot_programs
FOR INSERT
TO authenticated
WITH CHECK (
  -- User must set company_id to their own company (or null for super admin)
  (is_super_admin() AND company_id IS NOT NULL)
  OR company_id = get_user_company_id()
);

-- UPDATE policies
CREATE POLICY "Super admins can update all programs"
ON pilot_programs
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can update company programs"
ON pilot_programs
FOR UPDATE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
)
WITH CHECK (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

CREATE POLICY "Program admins can update programs"
ON pilot_programs
FOR UPDATE
TO authenticated
USING (
  user_has_program_access(program_id)
  AND EXISTS (
    SELECT 1
    FROM pilot_program_users
    WHERE user_id = auth.uid()
      AND program_id = pilot_programs.program_id
      AND role = 'Admin'
  )
)
WITH CHECK (
  company_id = get_user_company_id() -- Cannot change to different company
);

-- DELETE policies
CREATE POLICY "Super admins can delete all programs"
ON pilot_programs
FOR DELETE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Company admins can delete company programs"
ON pilot_programs
FOR DELETE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- ==========================================
-- SITES TABLE RLS
-- ==========================================

-- Enable RLS on sites
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all sites" ON sites;
DROP POLICY IF EXISTS "Users can view sites in accessible programs" ON sites;
DROP POLICY IF EXISTS "Super admins can create sites" ON sites;
DROP POLICY IF EXISTS "Company users can create sites in accessible programs" ON sites;
DROP POLICY IF EXISTS "Super admins can update all sites" ON sites;
DROP POLICY IF EXISTS "Admins and editors can update sites" ON sites;
DROP POLICY IF EXISTS "Super admins can delete all sites" ON sites;
DROP POLICY IF EXISTS "Admins and editors can delete sites" ON sites;

-- SELECT policies
CREATE POLICY "Super admins can view all sites"
ON sites
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view sites in accessible programs"
ON sites
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
);

-- INSERT policies
CREATE POLICY "Super admins can create sites"
ON sites
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Company users can create sites in accessible programs"
ON sites
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND (
    user_is_company_admin()
    OR EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = sites.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
);

-- UPDATE policies
CREATE POLICY "Super admins can update all sites"
ON sites
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Admins and editors can update sites"
ON sites
FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND (
    user_is_company_admin()
    OR EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = sites.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
)
WITH CHECK (
  company_id = get_user_company_id() -- Cannot change to different company
);

-- DELETE policies
CREATE POLICY "Super admins can delete all sites"
ON sites
FOR DELETE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Admins and editors can delete sites"
ON sites
FOR DELETE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND (
    user_is_company_admin()
    OR EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = sites.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
);

-- ==========================================
-- SUBMISSIONS TABLE RLS
-- ==========================================

-- Enable RLS on submissions
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all submissions" ON submissions;
DROP POLICY IF EXISTS "Users can view submissions in accessible programs" ON submissions;
DROP POLICY IF EXISTS "Super admins can create submissions" ON submissions;
DROP POLICY IF EXISTS "Users can create submissions in accessible programs" ON submissions;
DROP POLICY IF EXISTS "Super admins can update all submissions" ON submissions;
DROP POLICY IF EXISTS "Admins and editors can update submissions" ON submissions;
DROP POLICY IF EXISTS "Super admins can delete all submissions" ON submissions;
DROP POLICY IF EXISTS "Admins and editors can delete submissions" ON submissions;

-- SELECT policies
CREATE POLICY "Super admins can view all submissions"
ON submissions
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view submissions in accessible programs"
ON submissions
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
);

-- INSERT policies
CREATE POLICY "Super admins can create submissions"
ON submissions
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Users can create submissions in accessible programs"
ON submissions
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND (
    user_is_company_admin()
    OR EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = submissions.program_id
        AND role IN ('Admin', 'Edit', 'Respond')
    )
  )
);

-- UPDATE policies
CREATE POLICY "Super admins can update all submissions"
ON submissions
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Admins and editors can update submissions"
ON submissions
FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND (
    user_is_company_admin()
    OR EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = submissions.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
)
WITH CHECK (
  company_id = get_user_company_id() -- Cannot change to different company
);

-- DELETE policies
CREATE POLICY "Super admins can delete all submissions"
ON submissions
FOR DELETE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Admins and editors can delete submissions"
ON submissions
FOR DELETE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND (
    user_is_company_admin()
    OR EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = submissions.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
);

-- ==========================================
-- PETRI_OBSERVATIONS TABLE RLS
-- ==========================================

-- Enable RLS on petri_observations
ALTER TABLE petri_observations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Users can view petri observations in accessible programs" ON petri_observations;
DROP POLICY IF EXISTS "Super admins can create petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Users can create petri observations in accessible programs" ON petri_observations;
DROP POLICY IF EXISTS "Super admins can update all petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Admins and editors can update petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Super admins can delete all petri observations" ON petri_observations;
DROP POLICY IF EXISTS "Admins and editors can delete petri observations" ON petri_observations;

-- SELECT policies
CREATE POLICY "Super admins can view all petri observations"
ON petri_observations
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view petri observations in accessible programs"
ON petri_observations
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
);

-- INSERT policies
CREATE POLICY "Super admins can create petri observations"
ON petri_observations
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Users can create petri observations in accessible programs"
ON petri_observations
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND (
    user_is_company_admin()
    OR EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = petri_observations.program_id
        AND role IN ('Admin', 'Edit', 'Respond')
    )
  )
);

-- UPDATE policies
CREATE POLICY "Super admins can update all petri observations"
ON petri_observations
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Admins and editors can update petri observations"
ON petri_observations
FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND (
    user_is_company_admin()
    OR EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = petri_observations.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
)
WITH CHECK (
  company_id = get_user_company_id() -- Cannot change to different company
);

-- DELETE policies
CREATE POLICY "Super admins can delete all petri observations"
ON petri_observations
FOR DELETE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Admins and editors can delete petri observations"
ON petri_observations
FOR DELETE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND (
    user_is_company_admin()
    OR EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = petri_observations.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
);

-- ==========================================
-- GASIFIER_OBSERVATIONS TABLE RLS
-- ==========================================

-- Enable RLS on gasifier_observations
ALTER TABLE gasifier_observations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Users can view gasifier observations in accessible programs" ON gasifier_observations;
DROP POLICY IF EXISTS "Super admins can create gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Users can create gasifier observations in accessible programs" ON gasifier_observations;
DROP POLICY IF EXISTS "Super admins can update all gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Admins and editors can update gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Super admins can delete all gasifier observations" ON gasifier_observations;
DROP POLICY IF EXISTS "Admins and editors can delete gasifier observations" ON gasifier_observations;

-- SELECT policies
CREATE POLICY "Super admins can view all gasifier observations"
ON gasifier_observations
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view gasifier observations in accessible programs"
ON gasifier_observations
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
);

-- INSERT policies
CREATE POLICY "Super admins can create gasifier observations"
ON gasifier_observations
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Users can create gasifier observations in accessible programs"
ON gasifier_observations
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND (
    user_is_company_admin()
    OR EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = gasifier_observations.program_id
        AND role IN ('Admin', 'Edit', 'Respond')
    )
  )
);

-- UPDATE policies
CREATE POLICY "Super admins can update all gasifier observations"
ON gasifier_observations
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Admins and editors can update gasifier observations"
ON gasifier_observations
FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND (
    user_is_company_admin()
    OR EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = gasifier_observations.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
)
WITH CHECK (
  company_id = get_user_company_id() -- Cannot change to different company
);

-- DELETE policies
CREATE POLICY "Super admins can delete all gasifier observations"
ON gasifier_observations
FOR DELETE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Admins and editors can delete gasifier observations"
ON gasifier_observations
FOR DELETE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND (
    user_is_company_admin()
    OR EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = gasifier_observations.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
);

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_program_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_is_company_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION user_is_company_admin_for_program(UUID) TO authenticated;

-- Add comments
COMMENT ON FUNCTION is_super_admin IS 'Check if current user is a super admin with access to all companies';
COMMENT ON FUNCTION get_user_company_id IS 'Get the company_id of the current user';
COMMENT ON FUNCTION user_has_program_access IS 'Check if user has explicit access to a program via pilot_program_users';
COMMENT ON FUNCTION user_is_company_admin IS 'Check if user is a company admin';
COMMENT ON FUNCTION user_is_company_admin_for_program IS 'Check if user is company admin for a specific program';
