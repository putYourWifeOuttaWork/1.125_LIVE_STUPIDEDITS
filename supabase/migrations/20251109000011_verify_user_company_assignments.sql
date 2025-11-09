/*
  # Verify and Fix User Company Assignments

  1. Purpose
    - Verify all users have proper company assignments
    - Ensure Sandhill Growers exists as a company
    - Create RPC functions to safely manage user company assignments

  2. Steps
    - Verify Sandhill Growers company exists
    - Check if matt@grmtek.com has correct company assignment
    - Create RPC function to update user company assignment
    - Create RPC function to make user a company admin
*/

-- ==========================================
-- STEP 1: Verify Sandhill Growers Exists
-- ==========================================

DO $$
DECLARE
  v_sandhill_id UUID;
  v_sandhill_count INTEGER;
BEGIN
  -- Check if Sandhill Growers exists
  SELECT company_id INTO v_sandhill_id
  FROM companies
  WHERE name = 'Sandhill Growers'
  LIMIT 1;

  IF v_sandhill_id IS NULL THEN
    -- Create Sandhill Growers if it doesn't exist
    INSERT INTO companies (name, description, website, created_at, updated_at)
    VALUES (
      'Sandhill Growers',
      'Sandhill is proud to be one of the largest "all native" nurseries in Florida, specializing in native plants, grasses, shrubs, and trees. We also have developed an Environmental Services Division providing a wide range of Ecosystem Restoration and Management.',
      'https://sandhillgrowers.com/',
      now(),
      now()
    )
    RETURNING company_id INTO v_sandhill_id;

    RAISE NOTICE 'Created Sandhill Growers company with ID: %', v_sandhill_id;
  ELSE
    RAISE NOTICE 'Sandhill Growers company already exists with ID: %', v_sandhill_id;
  END IF;

  -- Count programs in Sandhill Growers
  SELECT COUNT(*) INTO v_sandhill_count
  FROM pilot_programs
  WHERE company_id = v_sandhill_id;

  RAISE NOTICE 'Sandhill Growers has % programs', v_sandhill_count;
END $$;

-- ==========================================
-- STEP 2: Verify Matt's User Assignment
-- ==========================================

DO $$
DECLARE
  v_matt_id UUID;
  v_matt_company_id UUID;
  v_matt_is_admin BOOLEAN;
  v_sandhill_id UUID;
  v_updated BOOLEAN := false;
BEGIN
  -- Get Sandhill Growers ID
  SELECT company_id INTO v_sandhill_id
  FROM companies
  WHERE name = 'Sandhill Growers'
  LIMIT 1;

  -- Check Matt's user record
  SELECT id, company_id, is_company_admin
  INTO v_matt_id, v_matt_company_id, v_matt_is_admin
  FROM users
  WHERE email = 'matt@grmtek.com';

  IF v_matt_id IS NULL THEN
    RAISE NOTICE 'User matt@grmtek.com not found in users table - may need to log in first';
  ELSE
    RAISE NOTICE 'Found user matt@grmtek.com with ID: %', v_matt_id;
    RAISE NOTICE 'Current company_id: %', v_matt_company_id;
    RAISE NOTICE 'Current is_company_admin: %', v_matt_is_admin;

    -- Update if needed
    IF v_matt_company_id IS NULL OR v_matt_company_id != v_sandhill_id THEN
      UPDATE users
      SET company_id = v_sandhill_id,
          updated_at = now()
      WHERE id = v_matt_id;

      v_updated := true;
      RAISE NOTICE 'Updated matt@grmtek.com company_id to Sandhill Growers';
    END IF;

    IF v_matt_is_admin IS NOT TRUE THEN
      UPDATE users
      SET is_company_admin = true,
          updated_at = now()
      WHERE id = v_matt_id;

      v_updated := true;
      RAISE NOTICE 'Updated matt@grmtek.com to be a company admin';
    END IF;

    IF NOT v_updated THEN
      RAISE NOTICE 'matt@grmtek.com already has correct company and admin settings';
    END IF;
  END IF;
END $$;

-- ==========================================
-- STEP 3: Create RPC Function to Assign User to Company
-- ==========================================

CREATE OR REPLACE FUNCTION assign_user_to_company(
  p_user_email TEXT,
  p_company_name TEXT,
  p_make_admin BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_company_id UUID;
  v_result JSONB;
BEGIN
  -- Check if calling user is super admin
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Only super admins can assign users to companies'
    );
  END IF;

  -- Find the company
  SELECT company_id INTO v_company_id
  FROM companies
  WHERE name = p_company_name
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Company not found: ' || p_company_name
    );
  END IF;

  -- Find the user
  SELECT id INTO v_user_id
  FROM users
  WHERE email = p_user_email;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found: ' || p_user_email
    );
  END IF;

  -- Update the user
  UPDATE users
  SET
    company_id = v_company_id,
    is_company_admin = p_make_admin,
    updated_at = now()
  WHERE id = v_user_id;

  v_result := jsonb_build_object(
    'success', true,
    'message', 'User assigned to company successfully',
    'user_id', v_user_id,
    'user_email', p_user_email,
    'company_id', v_company_id,
    'company_name', p_company_name,
    'is_company_admin', p_make_admin
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- STEP 4: Create RPC Function to Toggle Admin Status
-- ==========================================

CREATE OR REPLACE FUNCTION toggle_user_company_admin(
  p_user_email TEXT,
  p_is_admin BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_calling_user_id UUID;
  v_calling_user_company_id UUID;
  v_target_user_company_id UUID;
  v_is_super_admin BOOLEAN;
  v_is_company_admin BOOLEAN;
BEGIN
  v_calling_user_id := auth.uid();

  -- Get calling user's permissions
  SELECT
    company_id,
    is_super_admin,
    is_company_admin
  INTO
    v_calling_user_company_id,
    v_is_super_admin,
    v_is_company_admin
  FROM users
  WHERE id = v_calling_user_id;

  -- Find the target user
  SELECT id, company_id INTO v_user_id, v_target_user_company_id
  FROM users
  WHERE email = p_user_email;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found: ' || p_user_email
    );
  END IF;

  -- Check permissions: super admin OR company admin for same company
  IF NOT v_is_super_admin AND NOT (v_is_company_admin AND v_calling_user_company_id = v_target_user_company_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Insufficient permissions to modify user admin status'
    );
  END IF;

  -- Update the user
  UPDATE users
  SET
    is_company_admin = p_is_admin,
    updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User admin status updated successfully',
    'user_email', p_user_email,
    'is_company_admin', p_is_admin
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION assign_user_to_company(TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_user_company_admin(TEXT, BOOLEAN) TO authenticated;

-- Add comments
COMMENT ON FUNCTION assign_user_to_company IS 'Super admin function to assign a user to a company and optionally make them a company admin';
COMMENT ON FUNCTION toggle_user_company_admin IS 'Function to toggle user company admin status (requires super admin or company admin of same company)';
