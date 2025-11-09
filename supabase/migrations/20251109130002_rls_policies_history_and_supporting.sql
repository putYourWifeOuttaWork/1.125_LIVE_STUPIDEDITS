/*
  # RLS Policies for History and Supporting Tables - Part 3

  This migration creates RLS policies for history/audit tables and supporting tables.
  Must be run after 20251109130001_rls_policies_all_tables.sql
*/

-- ==========================================
-- DEVICE_HISTORY TABLE RLS
-- ==========================================

-- SELECT: Analysts and above can view device history in their company
CREATE POLICY "Analysts can view company device history"
ON device_history FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('analyst')
      AND company_id = get_user_company_id()
    )
  )
);

-- INSERT: System only (created by triggers)
-- No user insert policy

-- UPDATE/DELETE: Read-only table, no update/delete policies for users
-- Only system triggers can write to this table

-- ==========================================
-- PILOT_PROGRAM_HISTORY TABLE RLS
-- ==========================================

-- SELECT: Analysts and above can view program history in their company
CREATE POLICY "Analysts can view company program history"
ON pilot_program_history FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('analyst')
      AND company_id = get_user_company_id()
    )
  )
);

-- INSERT: System only (created by triggers)
-- No user insert policy

-- UPDATE/DELETE: Read-only table, no update/delete policies for users

-- ==========================================
-- DEVICE_SITE_ASSIGNMENTS TABLE RLS
-- ==========================================

-- SELECT: Active users can view assignments in their company
CREATE POLICY "Users can view company device site assignments"
ON device_site_assignments FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Maintenance and above can create assignments
CREATE POLICY "Maintenance can create device site assignments"
ON device_site_assignments FOR INSERT
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

-- UPDATE: Maintenance and above can update assignments
CREATE POLICY "Maintenance can update device site assignments"
ON device_site_assignments FOR UPDATE
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

-- DELETE: Maintenance and above can delete assignments
CREATE POLICY "Maintenance can delete device site assignments"
ON device_site_assignments FOR DELETE
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
-- DEVICE_PROGRAM_ASSIGNMENTS TABLE RLS
-- ==========================================

-- SELECT: Active users can view assignments in their company
CREATE POLICY "Users can view company device program assignments"
ON device_program_assignments FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Maintenance and above can create assignments
CREATE POLICY "Maintenance can create device program assignments"
ON device_program_assignments FOR INSERT
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

-- UPDATE: Maintenance and above can update assignments
CREATE POLICY "Maintenance can update device program assignments"
ON device_program_assignments FOR UPDATE
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

-- DELETE: Maintenance and above can delete assignments
CREATE POLICY "Maintenance can delete device program assignments"
ON device_program_assignments FOR DELETE
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
-- SITE_PROGRAM_ASSIGNMENTS TABLE RLS
-- ==========================================

-- SELECT: Active users can view assignments in their company
CREATE POLICY "Users can view company site program assignments"
ON site_program_assignments FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Maintenance and above can create assignments
CREATE POLICY "Maintenance can create site program assignments"
ON site_program_assignments FOR INSERT
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

-- UPDATE: Maintenance and above can update assignments
CREATE POLICY "Maintenance can update site program assignments"
ON site_program_assignments FOR UPDATE
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

-- DELETE: Maintenance and above can delete assignments
CREATE POLICY "Maintenance can delete site program assignments"
ON site_program_assignments FOR DELETE
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
-- SUBMISSION_SESSIONS TABLE RLS
-- ==========================================

-- SELECT: Active users can view sessions in their company
CREATE POLICY "Users can view company submission sessions"
ON submission_sessions FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Observers and above can create sessions
CREATE POLICY "Observers can create submission sessions"
ON submission_sessions FOR INSERT
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

-- UPDATE: Observers and above can update sessions
CREATE POLICY "Observers can update submission sessions"
ON submission_sessions FOR UPDATE
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

-- DELETE: Maintenance and above can delete sessions
CREATE POLICY "Maintenance can delete submission sessions"
ON submission_sessions FOR DELETE
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
-- SITE_SNAPSHOTS TABLE RLS
-- ==========================================

-- SELECT: Active users can view snapshots in their company
CREATE POLICY "Users can view company site snapshots"
ON site_snapshots FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: System only (created by triggers)
-- No user insert policy

-- UPDATE: SysAdmins can update snapshots
CREATE POLICY "SysAdmins can update site snapshots"
ON site_snapshots FOR UPDATE
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
)
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('sysAdmin')
      AND company_id = get_user_company_id()
    )
  )
);

-- DELETE: SysAdmins can delete snapshots
CREATE POLICY "SysAdmins can delete site snapshots"
ON site_snapshots FOR DELETE
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
-- CUSTOM_REPORTS TABLE RLS
-- ==========================================

-- SELECT: Active users can view reports in their company
CREATE POLICY "Users can view company custom reports"
ON custom_reports FOR SELECT
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR company_id = get_user_company_id()
  )
);

-- INSERT: Analysts and above can create reports
CREATE POLICY "Analysts can create custom reports"
ON custom_reports FOR INSERT
TO authenticated
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      has_role('analyst')
      AND company_id = get_user_company_id()
    )
  )
);

-- UPDATE: Users can update their own reports, admins can update all company reports
CREATE POLICY "Users can update their own reports"
ON custom_reports FOR UPDATE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      company_id = get_user_company_id()
      AND (
        created_by_user_id = auth.uid()
        OR has_role('sysAdmin')
      )
    )
  )
)
WITH CHECK (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      company_id = get_user_company_id()
      AND (
        created_by_user_id = auth.uid()
        OR has_role('sysAdmin')
      )
    )
  )
);

-- DELETE: Users can delete their own reports, admins can delete all company reports
CREATE POLICY "Users can delete their own reports"
ON custom_reports FOR DELETE
TO authenticated
USING (
  is_user_active()
  AND (
    is_super_admin()
    OR (
      company_id = get_user_company_id()
      AND (
        created_by_user_id = auth.uid()
        OR has_role('sysAdmin')
      )
    )
  )
);

-- ==========================================
-- VALIDATION AND COMMENTS
-- ==========================================

-- Add comments to all policies for documentation
COMMENT ON POLICY "Users can view their company" ON companies IS 'Active users can view their own company, super admins can view all companies';
COMMENT ON POLICY "Users can view company users" ON users IS 'Active users can view other users in their company';
COMMENT ON POLICY "Users can view company programs" ON pilot_programs IS 'Active company users can view all programs in their company (no pilot_program_users needed)';
COMMENT ON POLICY "Users can view company sites" ON sites IS 'Active company users can view all sites in their company';
COMMENT ON POLICY "Users can view company submissions" ON submissions IS 'Active company users have read access to all submissions in their company';
COMMENT ON POLICY "Observers can create submissions" ON submissions IS 'Observer role and above can create submissions';
COMMENT ON POLICY "Maintenance can delete submissions" ON submissions IS 'Maintenance role and above can delete submissions';
COMMENT ON POLICY "Users can view company devices" ON devices IS 'Active company users can view all devices in their company';
COMMENT ON POLICY "Maintenance can create devices" ON devices IS 'Maintenance role and above can create and manage devices';
COMMENT ON POLICY "SysAdmins can delete device images" ON device_images IS 'Only sysAdmin role can delete device images (maintenance cannot)';
COMMENT ON POLICY "Analysts can view company device history" ON device_history IS 'Analyst role and above have read access to device history for analysis';
COMMENT ON POLICY "Analysts can view company program history" ON pilot_program_history IS 'Analyst role and above have read access to program history for analysis';

-- Create a validation function to check RLS is working correctly
CREATE OR REPLACE FUNCTION validate_rls_setup()
RETURNS TABLE(
  table_name text,
  rls_enabled boolean,
  policy_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.tablename::text,
    t.rowsecurity,
    COUNT(p.policyname)::bigint
  FROM pg_tables t
  LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
  WHERE t.schemaname = 'public'
    AND t.tablename IN (
      'companies', 'users', 'pilot_programs', 'sites', 'submissions',
      'petri_observations', 'gasifier_observations', 'devices',
      'device_telemetry', 'device_images', 'device_commands', 'device_alerts',
      'device_wake_sessions', 'device_history', 'device_site_assignments',
      'device_program_assignments', 'site_program_assignments',
      'pilot_program_history', 'submission_sessions', 'site_snapshots', 'custom_reports'
    )
  GROUP BY t.tablename, t.rowsecurity
  ORDER BY t.tablename;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on validation function
GRANT EXECUTE ON FUNCTION validate_rls_setup() TO authenticated;

COMMENT ON FUNCTION validate_rls_setup IS 'Validation function to check RLS is properly enabled on all tables';

-- Display validation results
SELECT * FROM validate_rls_setup();
