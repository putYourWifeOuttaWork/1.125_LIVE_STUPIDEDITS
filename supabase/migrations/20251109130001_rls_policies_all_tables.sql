/*
  # RLS Policies for All Tables - Part 2

  This migration creates all RLS policies for the complete role-based access control system.
  Must be run after 20251109130000_complete_rls_rebuild.sql
*/

-- ==========================================
-- COMPANIES TABLE RLS
-- ==========================================

-- SELECT: Active users can view their own company, super admins can view all
CREATE POLICY "Users can view their company"
ON companies FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Only super admins can create companies
CREATE POLICY "Super admins can create companies"
ON companies FOR INSERT
TO authenticated
WITH CHECK (
  is_user_active()
  AND is_super_admin()
);

-- UPDATE: Super admins can update any company, company admins can update their company
CREATE POLICY "Admins can update companies"
ON companies FOR UPDATE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (is_company_admin() AND company_id = get_user_company_id())
  )
)
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (is_company_admin() AND company_id = get_user_company_id())
  )
);

-- DELETE: Only super admins can delete companies
CREATE POLICY "Super admins can delete companies"
ON companies FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND is_super_admin()
);

-- ==========================================
-- USERS TABLE RLS
-- ==========================================

-- SELECT: Active users can view users in their company, super admins view all
CREATE POLICY "Users can view company users"
ON users FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
    OR id = auth.uid() -- Can always see own record
  )
);

-- INSERT: Only super admins can create users (registration handled separately)
CREATE POLICY "Super admins can create users"
ON users FOR INSERT
TO authenticated
WITH CHECK (
  is_user_active()
  AND is_super_admin()
);

-- UPDATE: Users can update own profile, admins can update company users
CREATE POLICY "Users can update profiles"
ON users FOR UPDATE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR id = auth.uid() -- Can update own profile
    OR (is_company_admin() AND company_id = get_user_company_id() AND id != auth.uid())
  )
)
WITH CHECK (
  is_user_active()
  AND (
    -- Super admins can change anything
    is_super_admin()
    OR
    -- Users can update own non-privileged fields
    (id = auth.uid() AND is_super_admin = (SELECT is_super_admin FROM users WHERE id = auth.uid()) AND is_company_admin = (SELECT is_company_admin FROM users WHERE id = auth.uid()))
    OR
    -- Company admins can update company users except super_admin flag and cannot deactivate themselves
    (is_company_admin() AND company_id = get_user_company_id() AND is_super_admin = false AND NOT (id = auth.uid() AND is_active = false))
  )
);

-- DELETE: Only super admins can delete users
CREATE POLICY "Super admins can delete users"
ON users FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND is_super_admin()
);

-- ==========================================
-- PILOT_PROGRAMS TABLE RLS
-- ==========================================

-- SELECT: Active users can view programs in their company
CREATE POLICY "Users can view company programs"
ON pilot_programs FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Company admins and sysAdmins can create programs in their company
CREATE POLICY "Admins can create programs"
ON pilot_programs FOR INSERT
TO authenticated
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      (is_company_admin() OR has_role('sysAdmin'))
      AND company_id = get_user_company_id()
    )
  )
);

-- UPDATE: Company admins and sysAdmins can update programs in their company
CREATE POLICY "Admins can update programs"
ON pilot_programs FOR UPDATE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      (is_company_admin() OR has_role('sysAdmin'))
      AND company_id = get_user_company_id()
    )
  )
)
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      (is_company_admin() OR has_role('sysAdmin'))
      AND company_id = get_user_company_id()
    )
  )
);

-- DELETE: Company admins and sysAdmins can delete programs in their company
CREATE POLICY "Admins can delete programs"
ON pilot_programs FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      (is_company_admin() OR has_role('sysAdmin'))
      AND company_id = get_user_company_id()
    )
  )
);

-- ==========================================
-- SITES TABLE RLS
-- ==========================================

-- SELECT: Active users can view sites in their company
CREATE POLICY "Users can view company sites"
ON sites FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Maintenance and above can create sites in their company
CREATE POLICY "Maintenance can create sites"
ON sites FOR INSERT
TO authenticated
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      (is_company_admin() OR has_role('maintenance'))
      AND company_id = get_user_company_id()
    )
  )
);

-- UPDATE: Maintenance and above can update sites in their company
CREATE POLICY "Maintenance can update sites"
ON sites FOR UPDATE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      (is_company_admin() OR has_role('maintenance'))
      AND company_id = get_user_company_id()
    )
  )
)
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      (is_company_admin() OR has_role('maintenance'))
      AND company_id = get_user_company_id()
    )
  )
);

-- DELETE: SysAdmins can delete sites in their company
CREATE POLICY "SysAdmins can delete sites"
ON sites FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      (is_company_admin() OR has_role('sysAdmin'))
      AND company_id = get_user_company_id()
    )
  )
);

-- ==========================================
-- SUBMISSIONS TABLE RLS
-- ==========================================

-- SELECT: Active users can view submissions in their company
CREATE POLICY "Users can view company submissions"
ON submissions FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Observers and above can create submissions
CREATE POLICY "Observers can create submissions"
ON submissions FOR INSERT
TO authenticated
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('observer')
      AND company_id = get_user_company_id()
    )
  )
);

-- UPDATE: Observers and above can update submissions
CREATE POLICY "Observers can update submissions"
ON submissions FOR UPDATE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('observer')
      AND company_id = get_user_company_id()
    )
  )
)
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('observer')
      AND company_id = get_user_company_id()
    )
  )
);

-- DELETE: Maintenance and above can delete submissions
CREATE POLICY "Maintenance can delete submissions"
ON submissions FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
);

-- ==========================================
-- PETRI_OBSERVATIONS TABLE RLS
-- ==========================================

-- SELECT: Active users can view observations in their company
CREATE POLICY "Users can view company petri observations"
ON petri_observations FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Observers and above can create observations
CREATE POLICY "Observers can create petri observations"
ON petri_observations FOR INSERT
TO authenticated
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('observer')
      AND company_id = get_user_company_id()
    )
  )
);

-- UPDATE: Observers and above can update observations
CREATE POLICY "Observers can update petri observations"
ON petri_observations FOR UPDATE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('observer')
      AND company_id = get_user_company_id()
    )
  )
)
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('observer')
      AND company_id = get_user_company_id()
    )
  )
);

-- DELETE: Maintenance and above can delete observations
CREATE POLICY "Maintenance can delete petri observations"
ON petri_observations FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
);

-- ==========================================
-- GASIFIER_OBSERVATIONS TABLE RLS
-- ==========================================

-- SELECT: Active users can view observations in their company
CREATE POLICY "Users can view company gasifier observations"
ON gasifier_observations FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Observers and above can create observations
CREATE POLICY "Observers can create gasifier observations"
ON gasifier_observations FOR INSERT
TO authenticated
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('observer')
      AND company_id = get_user_company_id()
    )
  )
);

-- UPDATE: Observers and above can update observations
CREATE POLICY "Observers can update gasifier observations"
ON gasifier_observations FOR UPDATE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('observer')
      AND company_id = get_user_company_id()
    )
  )
)
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('observer')
      AND company_id = get_user_company_id()
    )
  )
);

-- DELETE: Maintenance and above can delete observations
CREATE POLICY "Maintenance can delete gasifier observations"
ON gasifier_observations FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
);

-- ==========================================
-- DEVICES TABLE RLS
-- ==========================================

-- SELECT: Active users can view devices in their company
CREATE POLICY "Users can view company devices"
ON devices FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Maintenance and above can create devices
CREATE POLICY "Maintenance can create devices"
ON devices FOR INSERT
TO authenticated
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND (company_id = get_user_company_id() OR company_id IS NULL)
    )
  )
);

-- UPDATE: Maintenance and above can update devices
CREATE POLICY "Maintenance can update devices"
ON devices FOR UPDATE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
)
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
);

-- DELETE: SysAdmins can delete devices
CREATE POLICY "SysAdmins can delete devices"
ON devices FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('sysAdmin')
      AND company_id = get_user_company_id()
    )
  )
);

-- ==========================================
-- DEVICE_TELEMETRY TABLE RLS
-- ==========================================

-- SELECT: Active users can view telemetry in their company
CREATE POLICY "Users can view company device telemetry"
ON device_telemetry FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Maintenance and above can create telemetry records
CREATE POLICY "Maintenance can create device telemetry"
ON device_telemetry FOR INSERT
TO authenticated
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
);

-- UPDATE: Maintenance and above can update telemetry
CREATE POLICY "Maintenance can update device telemetry"
ON device_telemetry FOR UPDATE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
)
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
);

-- DELETE: SysAdmins can delete telemetry
CREATE POLICY "SysAdmins can delete device telemetry"
ON device_telemetry FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('sysAdmin')
      AND company_id = get_user_company_id()
    )
  )
);

-- ==========================================
-- DEVICE_IMAGES TABLE RLS
-- ==========================================

-- SELECT: Active users can view images in their company
CREATE POLICY "Users can view company device images"
ON device_images FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Maintenance and above can create image records
CREATE POLICY "Maintenance can create device images"
ON device_images FOR INSERT
TO authenticated
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
);

-- UPDATE: Maintenance and above can update image records
CREATE POLICY "Maintenance can update device images"
ON device_images FOR UPDATE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
)
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
);

-- DELETE: Only SysAdmins can delete device images
CREATE POLICY "SysAdmins can delete device images"
ON device_images FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('sysAdmin')
      AND company_id = get_user_company_id()
    )
  )
);

-- ==========================================
-- DEVICE_COMMANDS TABLE RLS
-- ==========================================

-- SELECT: Active users can view commands in their company
CREATE POLICY "Users can view company device commands"
ON device_commands FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Maintenance and above can create commands
CREATE POLICY "Maintenance can create device commands"
ON device_commands FOR INSERT
TO authenticated
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
);

-- UPDATE: Maintenance and above can update commands
CREATE POLICY "Maintenance can update device commands"
ON device_commands FOR UPDATE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
)
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
);

-- DELETE: SysAdmins can delete commands
CREATE POLICY "SysAdmins can delete device commands"
ON device_commands FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('sysAdmin')
      AND company_id = get_user_company_id()
    )
  )
);

-- ==========================================
-- DEVICE_ALERTS TABLE RLS
-- ==========================================

-- SELECT: Active users can view alerts in their company
CREATE POLICY "Users can view company device alerts"
ON device_alerts FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: System only (no user insert policy)
-- Alerts are created by triggers and edge functions

-- UPDATE: Maintenance and above can resolve/update alerts
CREATE POLICY "Maintenance can update device alerts"
ON device_alerts FOR UPDATE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
)
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('maintenance')
      AND company_id = get_user_company_id()
    )
  )
);

-- DELETE: SysAdmins can delete alerts
CREATE POLICY "SysAdmins can delete device alerts"
ON device_alerts FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('sysAdmin')
      AND company_id = get_user_company_id()
    )
  )
);

-- ==========================================
-- DEVICE_WAKE_SESSIONS TABLE RLS
-- ==========================================

-- SELECT: Active users can view sessions in their company
CREATE POLICY "Users can view company device sessions"
ON device_wake_sessions FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT/UPDATE: System only (created by MQTT handlers and triggers)
-- No user insert/update policies

-- DELETE: SysAdmins can delete sessions
CREATE POLICY "SysAdmins can delete device sessions"
ON device_wake_sessions FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('sysAdmin')
      AND company_id = get_user_company_id()
    )
  )
);

-- Continue in next part...
