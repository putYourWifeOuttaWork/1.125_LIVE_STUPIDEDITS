/*
  # Restore Helper Function Compatibility

  1. Purpose
    - Bridge the gap between old (user_is_company_admin) and new (is_company_admin) function names
    - Create wrapper functions for backward compatibility with migration 20251109170001
    - Ensure migration 170001's RLS policies can execute without errors
    - Maintain both old and new function names during transition period

  2. Functions Restored
    - `user_is_company_admin()` - Wrapper for `is_company_admin()`
    - `user_has_program_access(UUID)` - Recreated for program access checks
    - `user_is_company_admin_for_program(UUID)` - Wrapper checking company admin + program company match

  3. Context
    - Migration 20251109000003 created these functions originally
    - Migration 20251109130000 dropped them and created new naming conventions
    - Migration 20251109170001 still references the old names in RLS policies
    - This migration provides backward compatibility while we transition

  4. Security
    - All functions use SECURITY DEFINER to ensure proper access control
    - Functions are STABLE as they don't modify data
    - Only accessible to authenticated users
*/

-- ==========================================
-- RESTORE: user_is_company_admin()
-- ==========================================

-- Wrapper function that calls the new is_company_admin() function
-- This maintains backward compatibility for RLS policies
CREATE OR REPLACE FUNCTION user_is_company_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Call the new function name
  RETURN is_company_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==========================================
-- RESTORE: user_has_program_access()
-- ==========================================

-- Function to check if user has explicit program access
-- Updated to work with company context system
CREATE OR REPLACE FUNCTION user_has_program_access(p_program_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_is_super_admin BOOLEAN;
  v_is_company_admin BOOLEAN;
  v_active_company_id UUID;
  v_program_company_id UUID;
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

  -- Super admins and company admins have implicit access to all programs
  -- in their active company context
  IF v_is_super_admin OR v_is_company_admin THEN
    -- Get active company context
    v_active_company_id := get_active_company_id();

    -- Get program's company
    SELECT company_id INTO v_program_company_id
    FROM pilot_programs
    WHERE program_id = p_program_id;

    -- Admin has access if program is in their active company
    RETURN v_active_company_id = v_program_company_id;
  END IF;

  -- For regular users, check explicit program assignment
  -- Note: This checks if the table exists first to avoid errors during migration
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'pilot_program_users'
  ) THEN
    RETURN EXISTS (
      SELECT 1
      FROM pilot_program_users ppu
      JOIN pilot_programs pp ON ppu.program_id = pp.program_id
      WHERE ppu.user_id = v_user_id
        AND ppu.program_id = p_program_id
        AND pp.company_id = get_active_company_id()
    );
  ELSE
    -- If pilot_program_users table doesn't exist, regular users have no access
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==========================================
-- RESTORE: user_is_company_admin_for_program()
-- ==========================================

-- Function to check if user is company admin for a specific program's company
CREATE OR REPLACE FUNCTION user_is_company_admin_for_program(p_program_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_is_company_admin BOOLEAN;
  v_active_company_id UUID;
  v_program_company_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check if user is a company admin
  SELECT is_company_admin INTO v_is_company_admin
  FROM users
  WHERE id = v_user_id;

  IF NOT v_is_company_admin THEN
    RETURN false;
  END IF;

  -- Get active company context
  v_active_company_id := get_active_company_id();

  -- Get program's company
  SELECT company_id INTO v_program_company_id
  FROM pilot_programs
  WHERE program_id = p_program_id;

  -- Return true if program belongs to user's active company
  RETURN v_active_company_id = v_program_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==========================================
-- GRANT PERMISSIONS
-- ==========================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION user_is_company_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_program_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_is_company_admin_for_program(UUID) TO authenticated;

-- ==========================================
-- ADD COMMENTS
-- ==========================================

COMMENT ON FUNCTION user_is_company_admin() IS
  'Backward compatibility wrapper for is_company_admin(). Check if current user is a company admin.';

COMMENT ON FUNCTION user_has_program_access(UUID) IS
  'Check if user has access to a specific program. Admins get implicit access, regular users need explicit assignment. Works with active company context.';

COMMENT ON FUNCTION user_is_company_admin_for_program(UUID) IS
  'Check if user is company admin for the company that owns the specified program. Uses active company context.';

-- ==========================================
-- VERIFICATION
-- ==========================================

-- Log successful restoration
DO $$
BEGIN
  RAISE NOTICE 'Successfully restored helper function compatibility:';
  RAISE NOTICE '  - user_is_company_admin()';
  RAISE NOTICE '  - user_has_program_access(UUID)';
  RAISE NOTICE '  - user_is_company_admin_for_program(UUID)';
  RAISE NOTICE 'These functions now work with the active company context system.';
END $$;
