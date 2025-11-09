/*
  # Create Active Company Context System

  1. Purpose
    - Implement strict single-company-at-a-time access model
    - Track which company each user (especially super admins) is currently "logged into"
    - Enable super admins to switch between companies with full CRUD in selected company only
    - Enforce absolute company boundaries - no cross-company data visibility

  2. New Tables
    - `user_active_company_context` - Stores active company selection per user
      - `user_id` (uuid, primary key) - References auth.users
      - `active_company_id` (uuid) - The company user is currently working in
      - `updated_at` (timestamptz) - Last time context was updated

  3. Helper Functions
    - `get_active_company_id()` - Returns the active company for current user
    - `set_active_company_context(company_id)` - Sets active company for current user
    - `initialize_user_company_context()` - Sets up initial context for new users

  4. Security
    - Users can only set their own company context
    - Super admins can switch to any company
    - Regular users are locked to their assigned company
    - Company admins are locked to their assigned company
*/

-- ==========================================
-- CREATE USER_ACTIVE_COMPANY_CONTEXT TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS user_active_company_context (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_active_company_context_user_id
  ON user_active_company_context(user_id);

CREATE INDEX IF NOT EXISTS idx_user_active_company_context_company_id
  ON user_active_company_context(active_company_id);

-- Enable RLS on the table
ALTER TABLE user_active_company_context ENABLE ROW LEVEL SECURITY;

-- Users can only view their own context
CREATE POLICY "Users can view own company context"
  ON user_active_company_context
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can only update their own context
CREATE POLICY "Users can update own company context"
  ON user_active_company_context
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can insert their own context
CREATE POLICY "Users can insert own company context"
  ON user_active_company_context
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ==========================================
-- HELPER FUNCTION: GET ACTIVE COMPANY ID
-- ==========================================

-- Function to get the active company ID for the current user
-- For super admins: returns the company they've selected in their context
-- For regular users/company admins: returns their assigned company_id
CREATE OR REPLACE FUNCTION get_active_company_id()
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_is_super_admin BOOLEAN;
  v_user_company_id UUID;
  v_active_company_id UUID;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get user's admin status and assigned company
  SELECT is_super_admin, company_id
  INTO v_is_super_admin, v_user_company_id
  FROM users
  WHERE id = v_user_id;

  -- If super admin, get their active company context
  IF v_is_super_admin = true THEN
    SELECT active_company_id
    INTO v_active_company_id
    FROM user_active_company_context
    WHERE user_id = v_user_id;

    -- If no context set, return their assigned company (or NULL if none)
    IF v_active_company_id IS NULL THEN
      RETURN v_user_company_id;
    END IF;

    RETURN v_active_company_id;
  ELSE
    -- Regular users and company admins are locked to their assigned company
    RETURN v_user_company_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==========================================
-- HELPER FUNCTION: SET ACTIVE COMPANY CONTEXT
-- ==========================================

-- Function to set the active company context for the current user
-- Super admins can switch to any company
-- Regular users can only set to their assigned company (no-op effectively)
CREATE OR REPLACE FUNCTION set_active_company_context(p_company_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_is_super_admin BOOLEAN;
  v_user_company_id UUID;
  v_company_exists BOOLEAN;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not authenticated'
    );
  END IF;

  -- Get user's admin status and assigned company
  SELECT is_super_admin, company_id
  INTO v_is_super_admin, v_user_company_id
  FROM users
  WHERE id = v_user_id;

  -- Verify the target company exists
  SELECT EXISTS(
    SELECT 1 FROM companies WHERE company_id = p_company_id
  ) INTO v_company_exists;

  IF NOT v_company_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Company does not exist'
    );
  END IF;

  -- Super admins can switch to any company
  IF v_is_super_admin = true THEN
    -- Insert or update the context
    INSERT INTO user_active_company_context (user_id, active_company_id, updated_at)
    VALUES (v_user_id, p_company_id, now())
    ON CONFLICT (user_id)
    DO UPDATE SET
      active_company_id = p_company_id,
      updated_at = now();

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Company context updated successfully',
      'active_company_id', p_company_id
    );
  ELSE
    -- Regular users can only set to their assigned company
    IF p_company_id = v_user_company_id THEN
      INSERT INTO user_active_company_context (user_id, active_company_id, updated_at)
      VALUES (v_user_id, p_company_id, now())
      ON CONFLICT (user_id)
      DO UPDATE SET
        active_company_id = p_company_id,
        updated_at = now();

      RETURN jsonb_build_object(
        'success', true,
        'message', 'Company context set to assigned company',
        'active_company_id', p_company_id
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Regular users can only access their assigned company'
      );
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- HELPER FUNCTION: GET ACTIVE COMPANY CONTEXT
-- ==========================================

-- Function to get the full active company context for the current user
CREATE OR REPLACE FUNCTION get_active_company_context()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_is_super_admin BOOLEAN;
  v_is_company_admin BOOLEAN;
  v_user_company_id UUID;
  v_active_company_id UUID;
  v_company_name TEXT;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not authenticated'
    );
  END IF;

  -- Get user details
  SELECT is_super_admin, is_company_admin, company_id
  INTO v_is_super_admin, v_is_company_admin, v_user_company_id
  FROM users
  WHERE id = v_user_id;

  -- Get active company ID
  v_active_company_id := get_active_company_id();

  -- Get company name
  IF v_active_company_id IS NOT NULL THEN
    SELECT name INTO v_company_name
    FROM companies
    WHERE company_id = v_active_company_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'is_super_admin', v_is_super_admin,
    'is_company_admin', v_is_company_admin,
    'assigned_company_id', v_user_company_id,
    'active_company_id', v_active_company_id,
    'active_company_name', v_company_name,
    'can_switch_companies', v_is_super_admin
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==========================================
-- HELPER FUNCTION: INITIALIZE USER CONTEXT
-- ==========================================

-- Function to initialize company context for a user (called on first login or user creation)
CREATE OR REPLACE FUNCTION initialize_user_company_context()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Get the user's assigned company
  SELECT company_id INTO v_company_id
  FROM users
  WHERE id = NEW.id;

  -- If user has a company assigned, set it as their active context
  IF v_company_id IS NOT NULL THEN
    INSERT INTO user_active_company_context (user_id, active_company_id, updated_at)
    VALUES (NEW.id, v_company_id, now())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-initialize context for new users
DROP TRIGGER IF EXISTS trigger_initialize_user_company_context ON auth.users;
CREATE TRIGGER trigger_initialize_user_company_context
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_company_context();

-- ==========================================
-- BACKFILL EXISTING USERS
-- ==========================================

-- Backfill active company context for all existing users
INSERT INTO user_active_company_context (user_id, active_company_id, updated_at)
SELECT id, company_id, now()
FROM users
WHERE company_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- ==========================================
-- GRANT PERMISSIONS
-- ==========================================

-- ==========================================
-- HELPER FUNCTION: USER HAS PROGRAM ACCESS
-- ==========================================

-- Function to check if user has access to a specific program
-- Integrates with active company context system
CREATE OR REPLACE FUNCTION user_has_program_access(p_program_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_is_super_admin BOOLEAN;
  v_is_company_admin BOOLEAN;
  v_active_company_id UUID;
  v_program_company_id UUID;
  v_table_exists BOOLEAN;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Get user's admin status
  SELECT is_super_admin, is_company_admin
  INTO v_is_super_admin, v_is_company_admin
  FROM users
  WHERE id = v_user_id;

  -- Get active company context
  v_active_company_id := get_active_company_id();

  -- Get program's company
  SELECT company_id INTO v_program_company_id
  FROM pilot_programs
  WHERE program_id = p_program_id;

  -- Program must be in user's active company
  IF v_active_company_id != v_program_company_id THEN
    RETURN false;
  END IF;

  -- Super admins and company admins have implicit access to all programs
  -- in their active company context
  IF v_is_super_admin OR v_is_company_admin THEN
    RETURN true;
  END IF;

  -- For regular users, check explicit program assignment
  -- Check if pilot_program_users table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'pilot_program_users'
  ) INTO v_table_exists;

  IF v_table_exists THEN
    RETURN EXISTS (
      SELECT 1
      FROM pilot_program_users
      WHERE user_id = v_user_id
        AND program_id = p_program_id
    );
  ELSE
    -- If pilot_program_users table doesn't exist, regular users have no access
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION get_active_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION set_active_company_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_company_context() TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_program_access(UUID) TO authenticated;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE ON user_active_company_context TO authenticated;

-- ==========================================
-- ADD COMMENTS
-- ==========================================

COMMENT ON TABLE user_active_company_context IS 'Stores which company each user is currently working in. Super admins can switch, regular users locked to assigned company.';
COMMENT ON COLUMN user_active_company_context.user_id IS 'The user ID (references auth.users)';
COMMENT ON COLUMN user_active_company_context.active_company_id IS 'The company the user is currently working in';
COMMENT ON COLUMN user_active_company_context.updated_at IS 'Last time the context was updated';

COMMENT ON FUNCTION get_active_company_id() IS 'Returns the active company ID for current user. Super admins get their selected company, regular users get their assigned company.';
COMMENT ON FUNCTION set_active_company_context(UUID) IS 'Sets the active company context for current user. Super admins can switch to any company, regular users locked to assigned company.';
COMMENT ON FUNCTION get_active_company_context() IS 'Returns full active company context details for current user including permissions and company info.';
COMMENT ON FUNCTION user_has_program_access(UUID) IS 'Check if user has access to a specific program. Admins get implicit access to all programs in their active company, regular users need explicit assignment via pilot_program_users.';
