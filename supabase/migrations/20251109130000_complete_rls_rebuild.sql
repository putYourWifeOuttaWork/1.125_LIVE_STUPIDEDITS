/*
  # Complete RLS Rebuild for Role-Based Multi-Tenant Architecture

  ## Overview
  This migration completely rebuilds the Row-Level Security (RLS) system to implement
  a streamlined role-based access control model with proper company isolation.

  ## Changes Summary

  ### 1. Schema Updates
  - Add export_rights enum and field to users table
  - Create trigger to sync company name with company_id
  - Ensure proper defaults on user role fields

  ### 2. RLS Policy Removal
  - Drop ALL existing RLS policies across all tables
  - Drop ALL existing RLS helper functions
  - Temporarily disable RLS for clean rebuild

  ### 3. New Helper Functions
  - is_user_active(): Check if user account is active
  - get_user_company_id(): Get user's company_id
  - is_super_admin(): Check super admin privileges
  - is_company_admin(): Check company admin flag
  - get_user_role(): Get user's role enum
  - has_role(): Check if user has specific role
  - can_export(): Validate export permissions

  ### 4. RLS Policies by Table
  - companies: Company-scoped read access
  - users: User management with role-based restrictions
  - pilot_programs: Company-scoped with role-based CRUD
  - sites: Company-scoped with maintenance write access
  - submissions: Company read, role-based write/delete
  - petri_observations: Role-based access control
  - gasifier_observations: Role-based access control
  - devices: Role-based device management
  - device_telemetry: Read for all, write for maintenance
  - device_images: Read for all, delete restricted
  - device_commands: Read for all, create for maintenance
  - device_alerts: Read for all, resolve for maintenance
  - device_wake_sessions: Read-only for all
  - device_history: Read-only for analysts and admins
  - pilot_program_history: Read-only for analysts and admins
  - All supporting tables with appropriate permissions

  ## Access Model

  ### Super Admin (is_super_admin = true)
  - Full CRUD access across all companies
  - All export rights enabled
  - Can manage all users including other super admins

  ### Company Admin (is_company_admin = true)
  - Full CRUD within their company
  - Can manage users in their company (except super_admin flag)
  - Export rights based on export_rights field OR sysAdmin role

  ### SysAdmin Role (user_role = 'sysAdmin')
  - Full CRUD within their company
  - When combined with is_company_admin: automatic full export rights
  - Otherwise: export rights based on export_rights field

  ### Maintenance Role (user_role = 'maintenance')
  - Read, write, update, delete for sessions and observations
  - Full device management (CRUD on devices, assignments, telemetry)
  - Can reassign devices within company
  - Cannot delete device images

  ### Analyst Role (user_role = 'analyst')
  - Read access to ALL data within company
  - Read access to all history and audit trails
  - Write access to submissions and observations
  - No delete permissions

  ### Observer Role (user_role = 'observer')
  - Read access to programs, sites, submissions within company
  - Write access to submissions and observations
  - No delete permissions
  - No device management

  ## Data Safety
  - All policies enforce is_active check
  - Strict company_id isolation
  - History tables are read-only for all users
  - Export rights controlled via separate field
  - Deactivated users blocked immediately
*/

-- ==========================================
-- STEP 1: SCHEMA UPDATES
-- ==========================================

-- Create export_rights enum if it doesn't exist
DO $$ BEGIN
  CREATE TYPE export_rights AS ENUM ('none', 'history', 'history_and_analytics', 'all');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create user_role enum if it doesn't exist
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('observer', 'analyst', 'maintenance', 'sysAdmin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add export_rights column to users table if it doesn't exist
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN export_rights export_rights DEFAULT 'none';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Ensure user_role column exists with proper type and default
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN user_role user_role DEFAULT 'observer';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Set NOT NULL constraints with defaults
ALTER TABLE users
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_company_admin SET DEFAULT false,
  ALTER COLUMN is_super_admin SET DEFAULT false,
  ALTER COLUMN user_role SET DEFAULT 'observer',
  ALTER COLUMN export_rights SET DEFAULT 'none';

-- Update NULL values to defaults
UPDATE users SET is_active = true WHERE is_active IS NULL;
UPDATE users SET is_company_admin = false WHERE is_company_admin IS NULL;
UPDATE users SET is_super_admin = false WHERE is_super_admin IS NULL;
UPDATE users SET user_role = 'observer' WHERE user_role IS NULL;
UPDATE users SET export_rights = 'none' WHERE export_rights IS NULL;

-- Add NOT NULL constraints
ALTER TABLE users
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN is_company_admin SET NOT NULL,
  ALTER COLUMN is_super_admin SET NOT NULL,
  ALTER COLUMN user_role SET NOT NULL,
  ALTER COLUMN export_rights SET NOT NULL;

-- Create or replace trigger to sync company name
CREATE OR REPLACE FUNCTION sync_user_company_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NOT NULL THEN
    SELECT name INTO NEW.company
    FROM companies
    WHERE company_id = NEW.company_id;
  ELSE
    NEW.company = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_company_name_trigger ON users;
CREATE TRIGGER sync_company_name_trigger
  BEFORE INSERT OR UPDATE OF company_id ON users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_company_name();

-- ==========================================
-- STEP 2: DROP ALL EXISTING RLS POLICIES
-- ==========================================

-- Helper function to drop all policies on a table
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

-- Drop policies on all tables
SELECT drop_all_policies_on_table('companies');
SELECT drop_all_policies_on_table('users');
SELECT drop_all_policies_on_table('pilot_programs');
SELECT drop_all_policies_on_table('pilot_program_users');
SELECT drop_all_policies_on_table('sites');
SELECT drop_all_policies_on_table('submissions');
SELECT drop_all_policies_on_table('petri_observations');
SELECT drop_all_policies_on_table('gasifier_observations');
SELECT drop_all_policies_on_table('devices');
SELECT drop_all_policies_on_table('device_telemetry');
SELECT drop_all_policies_on_table('device_images');
SELECT drop_all_policies_on_table('device_commands');
SELECT drop_all_policies_on_table('device_alerts');
SELECT drop_all_policies_on_table('device_wake_sessions');
SELECT drop_all_policies_on_table('device_history');
SELECT drop_all_policies_on_table('device_site_assignments');
SELECT drop_all_policies_on_table('device_program_assignments');
SELECT drop_all_policies_on_table('site_program_assignments');
SELECT drop_all_policies_on_table('pilot_program_history');
SELECT drop_all_policies_on_table('pilot_program_history_staging');
SELECT drop_all_policies_on_table('submission_sessions');
SELECT drop_all_policies_on_table('site_snapshots');
SELECT drop_all_policies_on_table('custom_reports');
SELECT drop_all_policies_on_table('split_petri_images');
SELECT drop_all_policies_on_table('device_error_codes');

-- Drop the helper function
DROP FUNCTION IF EXISTS drop_all_policies_on_table(text);

-- Drop old helper functions
DROP FUNCTION IF EXISTS is_super_admin();
DROP FUNCTION IF EXISTS get_user_company_id();
DROP FUNCTION IF EXISTS user_has_program_access(UUID);
DROP FUNCTION IF EXISTS user_is_company_admin();
DROP FUNCTION IF EXISTS user_is_company_admin_for_program(UUID);

-- ==========================================
-- STEP 3: CREATE NEW RLS HELPER FUNCTIONS
-- ==========================================

-- Function: Check if current user is active
CREATE OR REPLACE FUNCTION is_user_active()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM users
    WHERE id = auth.uid()
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function: Get user's company_id
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

-- Function: Check if user is super admin
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

-- Function: Check if user is company admin
CREATE OR REPLACE FUNCTION is_company_admin()
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

-- Function: Get user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT user_role INTO v_role
  FROM users
  WHERE id = auth.uid();

  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function: Check if user has specific role (or is admin/super admin)
CREATE OR REPLACE FUNCTION has_role(required_role user_role)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_role user_role;
  v_is_admin BOOLEAN;
  v_is_super_admin BOOLEAN;
BEGIN
  SELECT user_role, is_company_admin, is_super_admin
  INTO v_user_role, v_is_admin, v_is_super_admin
  FROM users
  WHERE id = auth.uid();

  -- Super admins and company admins have all role permissions
  IF v_is_super_admin OR v_is_admin THEN
    RETURN true;
  END IF;

  -- SysAdmin has all permissions within company
  IF v_user_role = 'sysAdmin' THEN
    RETURN true;
  END IF;

  -- Check for specific role hierarchy
  -- maintenance > analyst > observer
  IF required_role = 'observer' THEN
    RETURN v_user_role IN ('observer', 'analyst', 'maintenance', 'sysAdmin');
  ELSIF required_role = 'analyst' THEN
    RETURN v_user_role IN ('analyst', 'maintenance', 'sysAdmin');
  ELSIF required_role = 'maintenance' THEN
    RETURN v_user_role IN ('maintenance', 'sysAdmin');
  ELSIF required_role = 'sysAdmin' THEN
    RETURN v_user_role = 'sysAdmin';
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function: Check export permissions
CREATE OR REPLACE FUNCTION can_export(required_level export_rights)
RETURNS BOOLEAN AS $$
DECLARE
  v_export_rights export_rights;
  v_user_role user_role;
  v_is_admin BOOLEAN;
  v_is_super_admin BOOLEAN;
BEGIN
  SELECT export_rights, user_role, is_company_admin, is_super_admin
  INTO v_export_rights, v_user_role, v_is_admin, v_is_super_admin
  FROM users
  WHERE id = auth.uid();

  -- Super admins have all export rights
  IF v_is_super_admin THEN
    RETURN true;
  END IF;

  -- Company admin + sysAdmin = all export rights for their company
  IF v_is_admin AND v_user_role = 'sysAdmin' THEN
    RETURN true;
  END IF;

  -- Check export_rights field against required level
  IF required_level = 'none' THEN
    RETURN true;
  ELSIF required_level = 'history' THEN
    RETURN v_export_rights IN ('history', 'history_and_analytics', 'all');
  ELSIF required_level = 'history_and_analytics' THEN
    RETURN v_export_rights IN ('history_and_analytics', 'all');
  ELSIF required_level = 'all' THEN
    RETURN v_export_rights = 'all';
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION is_user_active() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_company_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION has_role(user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION can_export(export_rights) TO authenticated;

-- Add comments
COMMENT ON FUNCTION is_user_active IS 'Check if current user account is active';
COMMENT ON FUNCTION get_user_company_id IS 'Get the company_id of the current user';
COMMENT ON FUNCTION is_super_admin IS 'Check if user is a super admin with access to all companies';
COMMENT ON FUNCTION is_company_admin IS 'Check if user is a company admin';
COMMENT ON FUNCTION get_user_role IS 'Get the user_role enum value for current user';
COMMENT ON FUNCTION has_role IS 'Check if user has a specific role or higher (includes admin checks)';
COMMENT ON FUNCTION can_export IS 'Check if user has permission to export data at specified level';

-- ==========================================
-- STEP 4: ENABLE RLS ON ALL TABLES
-- ==========================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE petri_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasifier_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_wake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_site_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_program_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_program_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_program_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_reports ENABLE ROW LEVEL SECURITY;

-- Continue in next part...
