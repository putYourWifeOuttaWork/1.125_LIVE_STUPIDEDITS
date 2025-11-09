/*
  # Fix: Add user_has_program_access Function

  This migration adds the missing user_has_program_access function that is required
  by migration 170001. This function should have been created in migration 170000
  but the migration may have partially failed.

  The function checks if a user has access to a specific program, integrating with
  the active company context system.
*/

-- Drop existing function if it exists (in case of partial creation)
DROP FUNCTION IF EXISTS user_has_program_access(UUID) CASCADE;

-- Create the user_has_program_access function
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

  IF v_active_company_id IS NULL THEN
    RETURN false;
  END IF;

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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION user_has_program_access(UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION user_has_program_access(UUID) IS
  'Check if user has access to a specific program. Admins get implicit access to all programs in their active company, regular users need explicit assignment via pilot_program_users.';

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'Successfully created user_has_program_access function';
END $$;
