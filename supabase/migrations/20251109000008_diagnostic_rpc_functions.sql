/*
  # Diagnostic RPC Functions for Multi-Tenancy Access Control

  1. Purpose
    - Create diagnostic functions to troubleshoot access issues
    - Help identify why users cannot see programs/data
    - Provide visibility into RLS policy evaluation

  2. Functions Created
    - get_user_access_debug(): Show current user's access details
    - check_program_visibility(program_id): Diagnose specific program access
    - list_visible_programs(): Show all programs visible to current user
*/

-- ==========================================
-- Function: Get User Access Debug Info
-- ==========================================

CREATE OR REPLACE FUNCTION get_user_access_debug()
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_user_id UUID;
  v_user_company_id UUID;
  v_is_super_admin BOOLEAN;
  v_is_company_admin BOOLEAN;
  v_company_name TEXT;
  v_program_count INTEGER;
  v_explicit_program_count INTEGER;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'No authenticated user',
      'user_id', NULL
    );
  END IF;

  -- Get user details
  SELECT
    u.company_id,
    u.is_super_admin,
    u.is_company_admin,
    c.name
  INTO
    v_user_company_id,
    v_is_super_admin,
    v_is_company_admin,
    v_company_name
  FROM users u
  LEFT JOIN companies c ON u.company_id = c.company_id
  WHERE u.id = v_user_id;

  -- Count programs in user's company
  SELECT COUNT(*)
  INTO v_program_count
  FROM pilot_programs
  WHERE company_id = v_user_company_id;

  -- Count programs with explicit access
  SELECT COUNT(*)
  INTO v_explicit_program_count
  FROM pilot_program_users
  WHERE user_id = v_user_id;

  -- Build result
  v_result := jsonb_build_object(
    'user_id', v_user_id,
    'company_id', v_user_company_id,
    'company_name', v_company_name,
    'is_super_admin', v_is_super_admin,
    'is_company_admin', v_is_company_admin,
    'programs_in_company', v_program_count,
    'explicit_program_access_count', v_explicit_program_count,
    'access_summary', CASE
      WHEN v_is_super_admin THEN 'Super Admin - Should see all data across all companies'
      WHEN v_is_company_admin AND v_user_company_id IS NOT NULL THEN 'Company Admin - Should see all data in ' || v_company_name
      WHEN v_user_company_id IS NOT NULL THEN 'Regular User - Should see only explicitly assigned programs in ' || v_company_name
      ELSE 'No Company Assignment - Limited or no access'
    END
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==========================================
-- Function: Check Program Visibility
-- ==========================================

CREATE OR REPLACE FUNCTION check_program_visibility(p_program_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_user_id UUID;
  v_user_company_id UUID;
  v_program_company_id UUID;
  v_program_name TEXT;
  v_is_super_admin BOOLEAN;
  v_is_company_admin BOOLEAN;
  v_has_explicit_access BOOLEAN;
  v_can_see BOOLEAN;
  v_reasons TEXT[];
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  v_reasons := ARRAY[]::TEXT[];

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'No authenticated user',
      'can_see_program', false
    );
  END IF;

  -- Get user details
  SELECT company_id, is_super_admin, is_company_admin
  INTO v_user_company_id, v_is_super_admin, v_is_company_admin
  FROM users
  WHERE id = v_user_id;

  -- Get program details
  SELECT company_id, name
  INTO v_program_company_id, v_program_name
  FROM pilot_programs
  WHERE program_id = p_program_id;

  IF v_program_name IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'Program not found',
      'program_id', p_program_id,
      'can_see_program', false
    );
  END IF;

  -- Check explicit access
  SELECT EXISTS(
    SELECT 1
    FROM pilot_program_users
    WHERE user_id = v_user_id AND program_id = p_program_id
  ) INTO v_has_explicit_access;

  -- Evaluate access
  v_can_see := false;

  IF v_is_super_admin THEN
    v_can_see := true;
    v_reasons := array_append(v_reasons, 'User is Super Admin');
  END IF;

  IF v_is_company_admin AND v_user_company_id = v_program_company_id THEN
    v_can_see := true;
    v_reasons := array_append(v_reasons, 'User is Company Admin for this program''s company');
  END IF;

  IF v_has_explicit_access AND v_user_company_id = v_program_company_id THEN
    v_can_see := true;
    v_reasons := array_append(v_reasons, 'User has explicit access via pilot_program_users');
  END IF;

  IF NOT v_can_see THEN
    v_reasons := array_append(v_reasons, 'No access: User does not meet any access criteria');

    IF v_user_company_id IS NULL THEN
      v_reasons := array_append(v_reasons, 'User has no company assignment');
    ELSIF v_user_company_id != v_program_company_id THEN
      v_reasons := array_append(v_reasons, 'User belongs to different company than program');
    ELSIF NOT v_has_explicit_access THEN
      v_reasons := array_append(v_reasons, 'User lacks explicit program access in pilot_program_users');
    END IF;
  END IF;

  -- Build result
  v_result := jsonb_build_object(
    'program_id', p_program_id,
    'program_name', v_program_name,
    'program_company_id', v_program_company_id,
    'user_company_id', v_user_company_id,
    'is_super_admin', v_is_super_admin,
    'is_company_admin', v_is_company_admin,
    'has_explicit_access', v_has_explicit_access,
    'can_see_program', v_can_see,
    'reasons', v_reasons
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==========================================
-- Function: List Visible Programs (Diagnostic)
-- ==========================================

CREATE OR REPLACE FUNCTION list_visible_programs()
RETURNS TABLE (
  program_id UUID,
  program_name TEXT,
  company_name TEXT,
  access_reason TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_user_company_id UUID;
  v_is_super_admin BOOLEAN;
  v_is_company_admin BOOLEAN;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authenticated user';
  END IF;

  -- Get user details
  SELECT u.company_id, u.is_super_admin, u.is_company_admin
  INTO v_user_company_id, v_is_super_admin, v_is_company_admin
  FROM users u
  WHERE u.id = v_user_id;

  -- Return programs based on access level
  RETURN QUERY
  SELECT DISTINCT
    pp.program_id,
    pp.name::TEXT,
    c.name::TEXT,
    CASE
      WHEN v_is_super_admin THEN 'Super Admin Access'
      WHEN v_is_company_admin AND pp.company_id = v_user_company_id THEN 'Company Admin Access'
      WHEN EXISTS(
        SELECT 1 FROM pilot_program_users ppu
        WHERE ppu.user_id = v_user_id AND ppu.program_id = pp.program_id
      ) THEN 'Explicit Program Access'
      ELSE 'Unknown Access'
    END::TEXT
  FROM pilot_programs pp
  LEFT JOIN companies c ON pp.company_id = c.company_id
  WHERE
    -- Super admin sees all
    v_is_super_admin
    OR
    -- Company admin sees all in their company
    (v_is_company_admin AND pp.company_id = v_user_company_id)
    OR
    -- Regular users see explicitly assigned programs in their company
    (pp.company_id = v_user_company_id AND EXISTS(
      SELECT 1 FROM pilot_program_users ppu
      WHERE ppu.user_id = v_user_id AND ppu.program_id = pp.program_id
    ))
  ORDER BY pp.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_access_debug() TO authenticated;
GRANT EXECUTE ON FUNCTION check_program_visibility(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION list_visible_programs() TO authenticated;

-- Add comments
COMMENT ON FUNCTION get_user_access_debug IS 'Diagnostic function to show current user access details and company assignment';
COMMENT ON FUNCTION check_program_visibility IS 'Diagnostic function to check why a specific program is visible or not visible';
COMMENT ON FUNCTION list_visible_programs IS 'Diagnostic function to list all programs visible to current user with access reasons';
