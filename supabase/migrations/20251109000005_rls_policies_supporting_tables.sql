/*
  # Row-Level Security Policies for Supporting Tables

  1. Purpose
    - Implement company-based RLS for supporting tables
    - Enforce company isolation for sessions, snapshots, and audit logs
    - Control user visibility and management based on company membership

  2. Tables with RLS Policies
    - submission_sessions
    - site_snapshots
    - pilot_program_history
    - pilot_program_history_staging
    - users
    - pilot_program_users
    - split_petri_images

  3. Access Model
    - Super admins: Full access to all data
    - Company admins: Full access to their company's data
    - Regular users: Access to data in programs they have explicit access to
    - Users can only see other users in their own company
*/

-- ==========================================
-- SUBMISSION_SESSIONS TABLE RLS
-- ==========================================

-- Enable RLS on submission_sessions
ALTER TABLE submission_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all submission sessions" ON submission_sessions;
DROP POLICY IF EXISTS "Users can view submission sessions in accessible programs" ON submission_sessions;
DROP POLICY IF EXISTS "Super admins can create submission sessions" ON submission_sessions;
DROP POLICY IF EXISTS "Users can create submission sessions in accessible programs" ON submission_sessions;
DROP POLICY IF EXISTS "Super admins can update all submission sessions" ON submission_sessions;
DROP POLICY IF EXISTS "Users can update submission sessions in accessible programs" ON submission_sessions;
DROP POLICY IF EXISTS "Super admins can delete all submission sessions" ON submission_sessions;
DROP POLICY IF EXISTS "Admins can delete submission sessions" ON submission_sessions;

-- SELECT policies
CREATE POLICY "Super admins can view all submission sessions"
ON submission_sessions
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view submission sessions in accessible programs"
ON submission_sessions
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
);

-- INSERT policies
CREATE POLICY "Super admins can create submission sessions"
ON submission_sessions
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Users can create submission sessions in accessible programs"
ON submission_sessions
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
        AND program_id = submission_sessions.program_id
        AND role IN ('Admin', 'Edit', 'Respond')
    )
  )
);

-- UPDATE policies
CREATE POLICY "Super admins can update all submission sessions"
ON submission_sessions
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Users can update submission sessions in accessible programs"
ON submission_sessions
FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND (
    user_is_company_admin()
    OR opened_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = auth.uid()
        AND program_id = submission_sessions.program_id
        AND role IN ('Admin', 'Edit')
    )
  )
)
WITH CHECK (
  company_id = get_user_company_id()
);

-- DELETE policies
CREATE POLICY "Super admins can delete all submission sessions"
ON submission_sessions
FOR DELETE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Admins can delete submission sessions"
ON submission_sessions
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
        AND program_id = submission_sessions.program_id
        AND role = 'Admin'
    )
  )
);

-- ==========================================
-- SITE_SNAPSHOTS TABLE RLS
-- ==========================================

-- Enable RLS on site_snapshots (already has company_id from original schema)
ALTER TABLE site_snapshots ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all site snapshots" ON site_snapshots;
DROP POLICY IF EXISTS "Users can view site snapshots in accessible programs" ON site_snapshots;
DROP POLICY IF EXISTS "Super admins can create site snapshots" ON site_snapshots;
DROP POLICY IF EXISTS "System can create site snapshots" ON site_snapshots;
DROP POLICY IF EXISTS "Super admins can update site snapshots" ON site_snapshots;
DROP POLICY IF EXISTS "System can update site snapshots" ON site_snapshots;

-- SELECT policies
CREATE POLICY "Super admins can view all site snapshots"
ON site_snapshots
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view site snapshots in accessible programs"
ON site_snapshots
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
);

-- INSERT policies
CREATE POLICY "Super admins can create site snapshots"
ON site_snapshots
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "System can create site snapshots"
ON site_snapshots
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
);

-- UPDATE policies
CREATE POLICY "Super admins can update site snapshots"
ON site_snapshots
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "System can update site snapshots"
ON site_snapshots
FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
)
WITH CHECK (
  company_id = get_user_company_id()
);

-- ==========================================
-- PILOT_PROGRAM_HISTORY TABLE RLS
-- ==========================================

-- Enable RLS on pilot_program_history
ALTER TABLE pilot_program_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all program history" ON pilot_program_history;
DROP POLICY IF EXISTS "Users can view program history in accessible programs" ON pilot_program_history;
DROP POLICY IF EXISTS "System can create program history" ON pilot_program_history;

-- SELECT policies (read-only audit log)
CREATE POLICY "Super admins can view all program history"
ON pilot_program_history
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view program history in accessible programs"
ON pilot_program_history
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (
    program_id IS NULL -- Global events
    OR user_has_program_access(program_id)
  )
);

-- INSERT policy (system only, for audit trail)
CREATE POLICY "System can create program history"
ON pilot_program_history
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin()
  OR company_id = get_user_company_id()
);

-- ==========================================
-- PILOT_PROGRAM_HISTORY_STAGING TABLE RLS
-- ==========================================

-- Enable RLS on pilot_program_history_staging
ALTER TABLE pilot_program_history_staging ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all program history staging" ON pilot_program_history_staging;
DROP POLICY IF EXISTS "Users can view program history staging in accessible programs" ON pilot_program_history_staging;
DROP POLICY IF EXISTS "System can create program history staging" ON pilot_program_history_staging;

-- SELECT policies
CREATE POLICY "Super admins can view all program history staging"
ON pilot_program_history_staging
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view program history staging in accessible programs"
ON pilot_program_history_staging
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (
    program_id IS NULL
    OR user_has_program_access(program_id)
  )
);

-- INSERT policy
CREATE POLICY "System can create program history staging"
ON pilot_program_history_staging
FOR INSERT
TO authenticated
WITH CHECK (true); -- Allow all authenticated users, company_id will be set by trigger

-- ==========================================
-- USERS TABLE RLS
-- ==========================================

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all users" ON users;
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can view company members" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Super admins can update all users" ON users;
DROP POLICY IF EXISTS "Company admins can update company users" ON users;

-- SELECT policies
CREATE POLICY "Super admins can view all users"
ON users
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view their own profile"
ON users
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can view company members"
ON users
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND company_id IS NOT NULL
);

-- UPDATE policies
CREATE POLICY "Users can update their own profile"
ON users
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND company_id = get_user_company_id() -- Cannot change own company
  AND is_company_admin = (
    SELECT is_company_admin FROM users WHERE id = auth.uid()
  ) -- Cannot change own admin status
);

CREATE POLICY "Super admins can update all users"
ON users
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can update company users"
ON users
FOR UPDATE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
  AND id != auth.uid() -- Cannot update self through this policy
)
WITH CHECK (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- ==========================================
-- PILOT_PROGRAM_USERS TABLE RLS
-- ==========================================

-- Enable RLS on pilot_program_users
ALTER TABLE pilot_program_users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all program users" ON pilot_program_users;
DROP POLICY IF EXISTS "Users can view program users in accessible programs" ON pilot_program_users;
DROP POLICY IF EXISTS "Super admins can add users to programs" ON pilot_program_users;
DROP POLICY IF EXISTS "Company admins can add users to company programs" ON pilot_program_users;
DROP POLICY IF EXISTS "Program admins can add users to programs" ON pilot_program_users;
DROP POLICY IF EXISTS "Super admins can update all program users" ON pilot_program_users;
DROP POLICY IF EXISTS "Company admins can update program users in company programs" ON pilot_program_users;
DROP POLICY IF EXISTS "Program admins can update program users" ON pilot_program_users;
DROP POLICY IF EXISTS "Super admins can delete all program users" ON pilot_program_users;
DROP POLICY IF EXISTS "Company admins can delete program users in company programs" ON pilot_program_users;
DROP POLICY IF EXISTS "Program admins can delete program users" ON pilot_program_users;

-- SELECT policies
CREATE POLICY "Super admins can view all program users"
ON pilot_program_users
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view program users in accessible programs"
ON pilot_program_users
FOR SELECT
TO authenticated
USING (
  user_has_program_access(program_id)
  OR EXISTS (
    SELECT 1
    FROM pilot_programs pp
    WHERE pp.program_id = pilot_program_users.program_id
      AND pp.company_id = get_user_company_id()
  )
);

-- INSERT policies
CREATE POLICY "Super admins can add users to programs"
ON pilot_program_users
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can add users to company programs"
ON pilot_program_users
FOR INSERT
TO authenticated
WITH CHECK (
  user_is_company_admin()
  AND EXISTS (
    SELECT 1
    FROM pilot_programs pp
    WHERE pp.program_id = pilot_program_users.program_id
      AND pp.company_id = get_user_company_id()
  )
  AND EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = pilot_program_users.user_id
      AND u.company_id = get_user_company_id()
  )
);

CREATE POLICY "Program admins can add users to programs"
ON pilot_program_users
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.program_id = pilot_program_users.program_id
      AND ppu.user_id = auth.uid()
      AND ppu.role = 'Admin'
  )
  AND EXISTS (
    SELECT 1
    FROM pilot_programs pp
    WHERE pp.program_id = pilot_program_users.program_id
      AND pp.company_id = get_user_company_id()
  )
  AND EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = pilot_program_users.user_id
      AND u.company_id = get_user_company_id()
  )
);

-- UPDATE policies
CREATE POLICY "Super admins can update all program users"
ON pilot_program_users
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can update program users in company programs"
ON pilot_program_users
FOR UPDATE
TO authenticated
USING (
  user_is_company_admin()
  AND EXISTS (
    SELECT 1
    FROM pilot_programs pp
    WHERE pp.program_id = pilot_program_users.program_id
      AND pp.company_id = get_user_company_id()
  )
)
WITH CHECK (
  user_is_company_admin()
  AND EXISTS (
    SELECT 1
    FROM pilot_programs pp
    WHERE pp.program_id = pilot_program_users.program_id
      AND pp.company_id = get_user_company_id()
  )
);

CREATE POLICY "Program admins can update program users"
ON pilot_program_users
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.program_id = pilot_program_users.program_id
      AND ppu.user_id = auth.uid()
      AND ppu.role = 'Admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.program_id = pilot_program_users.program_id
      AND ppu.user_id = auth.uid()
      AND ppu.role = 'Admin'
  )
);

-- DELETE policies
CREATE POLICY "Super admins can delete all program users"
ON pilot_program_users
FOR DELETE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Company admins can delete program users in company programs"
ON pilot_program_users
FOR DELETE
TO authenticated
USING (
  user_is_company_admin()
  AND EXISTS (
    SELECT 1
    FROM pilot_programs pp
    WHERE pp.program_id = pilot_program_users.program_id
      AND pp.company_id = get_user_company_id()
  )
);

CREATE POLICY "Program admins can delete program users"
ON pilot_program_users
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM pilot_program_users ppu
    WHERE ppu.program_id = pilot_program_users.program_id
      AND ppu.user_id = auth.uid()
      AND ppu.role = 'Admin'
  )
  AND user_id != auth.uid() -- Cannot remove themselves
);

-- ==========================================
-- SPLIT_PETRI_IMAGES TABLE RLS
-- ==========================================

-- Enable RLS on split_petri_images
ALTER TABLE split_petri_images ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all split petri images" ON split_petri_images;
DROP POLICY IF EXISTS "Users can view split petri images in accessible programs" ON split_petri_images;
DROP POLICY IF EXISTS "Super admins can create split petri images" ON split_petri_images;
DROP POLICY IF EXISTS "Users can create split petri images in accessible programs" ON split_petri_images;
DROP POLICY IF EXISTS "Super admins can update split petri images" ON split_petri_images;
DROP POLICY IF EXISTS "Users can update split petri images in accessible programs" ON split_petri_images;
DROP POLICY IF EXISTS "Super admins can delete split petri images" ON split_petri_images;
DROP POLICY IF EXISTS "Users can delete split petri images in accessible programs" ON split_petri_images;

-- SELECT policies
CREATE POLICY "Super admins can view all split petri images"
ON split_petri_images
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view split petri images in accessible programs"
ON split_petri_images
FOR SELECT
TO authenticated
USING (
  main_petri_observation_id IN (
    SELECT observation_id
    FROM petri_observations
    WHERE company_id = get_user_company_id()
      AND user_has_program_access(program_id)
  )
);

-- INSERT policies
CREATE POLICY "Super admins can create split petri images"
ON split_petri_images
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Users can create split petri images in accessible programs"
ON split_petri_images
FOR INSERT
TO authenticated
WITH CHECK (
  main_petri_observation_id IN (
    SELECT observation_id
    FROM petri_observations
    WHERE company_id = get_user_company_id()
      AND user_has_program_access(program_id)
  )
);

-- UPDATE policies
CREATE POLICY "Super admins can update split petri images"
ON split_petri_images
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Users can update split petri images in accessible programs"
ON split_petri_images
FOR UPDATE
TO authenticated
USING (
  main_petri_observation_id IN (
    SELECT observation_id
    FROM petri_observations
    WHERE company_id = get_user_company_id()
      AND user_has_program_access(program_id)
  )
)
WITH CHECK (
  main_petri_observation_id IN (
    SELECT observation_id
    FROM petri_observations
    WHERE company_id = get_user_company_id()
      AND user_has_program_access(program_id)
  )
);

-- DELETE policies
CREATE POLICY "Super admins can delete split petri images"
ON split_petri_images
FOR DELETE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can delete split petri images in accessible programs"
ON split_petri_images
FOR DELETE
TO authenticated
USING (
  main_petri_observation_id IN (
    SELECT observation_id
    FROM petri_observations
    WHERE company_id = get_user_company_id()
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
);

-- Add helpful comments
COMMENT ON POLICY "Super admins can view all submission sessions" ON submission_sessions IS 'Super admins have unrestricted access to all submission sessions';
COMMENT ON POLICY "Users can view submission sessions in accessible programs" ON submission_sessions IS 'Users can view sessions in programs they have explicit access to within their company';
COMMENT ON POLICY "Super admins can view all users" ON users IS 'Super admins can view all user profiles across all companies';
COMMENT ON POLICY "Users can view company members" ON users IS 'Users can view other users within their own company';
COMMENT ON POLICY "Company admins can update company users" ON users IS 'Company admins can manage users within their own company';
