/*
  # RLS Rebuild Rollback Script

  EMERGENCY USE ONLY

  This script will rollback the RLS rebuild migrations if critical issues are found.

  WARNING: This will restore the old RLS system but may not perfectly restore
  all previous policies. Review carefully before executing.

  ## Rollback Steps:
  1. Restore pilot_program_users table from archive
  2. Remove new RLS policies
  3. Remove new helper functions
  4. Restore previous helper functions (basic versions)
  5. Restore previous RLS policies (simplified versions)
  6. Remove export_rights field (optional)
*/

-- ==========================================
-- STEP 1: RESTORE PILOT_PROGRAM_USERS TABLE
-- ==========================================

-- Recreate the pilot_program_users table
CREATE TABLE IF NOT EXISTS pilot_program_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES pilot_programs(program_id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL DEFAULT 'Respond',
  created_at timestamptz NOT NULL DEFAULT now(),
  user_email varchar
);

-- Restore data from archive
INSERT INTO pilot_program_users (id, program_id, user_id, role, created_at, user_email)
SELECT id, program_id, user_id, role, created_at, user_email
FROM pilot_program_users_archive
ON CONFLICT (id) DO NOTHING;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_pilot_program_users_program_id ON pilot_program_users(program_id);
CREATE INDEX IF NOT EXISTS idx_pilot_program_users_user_id ON pilot_program_users(user_id);

-- ==========================================
-- STEP 2: DROP NEW RLS POLICIES
-- ==========================================

-- Helper function to drop all policies
CREATE OR REPLACE FUNCTION drop_all_policies_on_table(table_name text)
RETURNS void AS $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = table_name
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_record.policyname, table_name);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Drop all policies on all tables
SELECT drop_all_policies_on_table(tablename::text)
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'companies', 'users', 'pilot_programs', 'sites', 'submissions',
    'petri_observations', 'gasifier_observations', 'devices',
    'device_telemetry', 'device_images', 'device_commands', 'device_alerts',
    'device_wake_sessions', 'device_history', 'device_site_assignments',
    'device_program_assignments', 'site_program_assignments',
    'pilot_program_history', 'submission_sessions', 'site_snapshots',
    'custom_reports', 'pilot_program_users'
  );

-- ==========================================
-- STEP 3: DROP NEW HELPER FUNCTIONS
-- ==========================================

DROP FUNCTION IF EXISTS is_user_active();
DROP FUNCTION IF EXISTS get_user_company_id();
DROP FUNCTION IF EXISTS is_super_admin();
DROP FUNCTION IF EXISTS is_company_admin();
DROP FUNCTION IF EXISTS get_user_role();
DROP FUNCTION IF EXISTS has_role(user_role);
DROP FUNCTION IF EXISTS can_export(export_rights);
DROP FUNCTION IF EXISTS validate_rls_setup();

-- ==========================================
-- STEP 4: RESTORE BASIC HELPER FUNCTIONS
-- ==========================================

-- Basic is_super_admin function
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

-- Basic get_user_company_id function
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

-- Basic user_has_program_access function
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

-- Basic user_is_company_admin function
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

GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_program_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_is_company_admin() TO authenticated;

-- ==========================================
-- STEP 5: RESTORE BASIC RLS POLICIES
-- ==========================================

-- PILOT_PROGRAMS basic policies
CREATE POLICY "Super admins can view all programs"
ON pilot_programs FOR SELECT TO authenticated
USING (is_super_admin());

CREATE POLICY "Company admins can view company programs"
ON pilot_programs FOR SELECT TO authenticated
USING (user_is_company_admin() AND company_id = get_user_company_id());

CREATE POLICY "Users can view programs with explicit access"
ON pilot_programs FOR SELECT TO authenticated
USING (company_id = get_user_company_id() AND user_has_program_access(program_id));

-- SITES basic policies
CREATE POLICY "Super admins can view all sites"
ON sites FOR SELECT TO authenticated
USING (is_super_admin());

CREATE POLICY "Company admins can view company sites"
ON sites FOR SELECT TO authenticated
USING (user_is_company_admin() AND company_id = get_user_company_id());

CREATE POLICY "Users can view sites in accessible programs"
ON sites FOR SELECT TO authenticated
USING (company_id = get_user_company_id() AND user_has_program_access(program_id));

-- SUBMISSIONS basic policies
CREATE POLICY "Super admins can view all submissions"
ON submissions FOR SELECT TO authenticated
USING (is_super_admin());

CREATE POLICY "Company admins can view company submissions"
ON submissions FOR SELECT TO authenticated
USING (user_is_company_admin() AND company_id = get_user_company_id());

CREATE POLICY "Users can view submissions in accessible programs"
ON submissions FOR SELECT TO authenticated
USING (company_id = get_user_company_id() AND user_has_program_access(program_id));

-- DEVICES basic policies
CREATE POLICY "Super admins can view all devices"
ON devices FOR SELECT TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view company devices"
ON devices FOR SELECT TO authenticated
USING (company_id = get_user_company_id());

-- Add similar basic SELECT policies for other tables as needed...

-- ==========================================
-- STEP 6: OPTIONAL - REMOVE EXPORT_RIGHTS
-- ==========================================

-- Uncomment if you want to remove the export_rights field
-- ALTER TABLE users DROP COLUMN IF EXISTS export_rights;
-- DROP TYPE IF EXISTS export_rights;

-- ==========================================
-- CLEANUP
-- ==========================================

DROP FUNCTION IF EXISTS drop_all_policies_on_table(text);

-- ==========================================
-- VERIFICATION
-- ==========================================

SELECT 'Rollback complete. Please verify the following:' as message
UNION ALL
SELECT '1. pilot_program_users table exists and has data'
UNION ALL
SELECT '2. Basic helper functions are restored'
UNION ALL
SELECT '3. Basic RLS policies are in place'
UNION ALL
SELECT '4. Application functionality is restored';

SELECT COUNT(*) as pilot_program_users_count FROM pilot_program_users;
