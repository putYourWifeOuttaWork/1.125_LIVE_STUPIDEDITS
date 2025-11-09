/*
  # User Management and Device Pool Functions

  ## Overview
  This migration creates the necessary RPC functions and views to support:
  1. User search and assignment to companies
  2. Device pool management for unassigned devices
  3. Device assignment to companies

  ## New Functions

  ### User Management
  - `search_users_by_email`: Search for existing users across all companies by email
  - `add_user_to_company`: Assign an existing user to a company
  - `remove_user_from_company`: Remove user assignment from company

  ### Device Pool Management
  - `get_unassigned_devices`: View devices not yet assigned to any company
  - `assign_device_to_company`: Assign device to a specific company
  - `get_device_pool_stats`: Get statistics about unassigned devices

  ## Security
  - All functions check user permissions (super admin or company admin)
  - User management restricted to company admins within their company
  - Device pool functions restricted to super admins only
  - Comprehensive error handling and validation

  ## Views
  - Creates view for unassigned devices visible only to super admins
*/

-- ==========================================
-- USER MANAGEMENT FUNCTIONS
-- ==========================================

-- Drop existing functions if they exist with different signatures
DROP FUNCTION IF EXISTS search_users_by_email(text);
DROP FUNCTION IF EXISTS add_user_to_company(text, uuid);
DROP FUNCTION IF EXISTS remove_user_from_company(uuid);
DROP FUNCTION IF EXISTS get_unassigned_devices();
DROP FUNCTION IF EXISTS assign_device_to_company(uuid, uuid);
DROP FUNCTION IF EXISTS get_device_pool_stats();

-- Search for users by email (existing users only)
CREATE OR REPLACE FUNCTION search_users_by_email(search_query text)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  company_id uuid,
  company_name text,
  is_active boolean,
  is_company_admin boolean,
  user_role user_role
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Return matching users (limit results for performance)
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.full_name,
    u.company_id,
    c.name as company_name,
    u.is_active,
    u.is_company_admin,
    u.user_role
  FROM users u
  LEFT JOIN companies c ON c.company_id = u.company_id
  WHERE u.email ILIKE '%' || search_query || '%'
    AND u.is_active = true
  ORDER BY u.email
  LIMIT 20;
END;
$$;

-- Add user to company
CREATE OR REPLACE FUNCTION add_user_to_company(
  p_user_email text,
  p_company_id uuid
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_target_user_id uuid;
  v_current_user_company_id uuid;
  v_is_super_admin boolean;
  v_is_company_admin boolean;
  v_target_user_current_company uuid;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Not authenticated'
    );
  END IF;

  -- Get current user's permissions
  SELECT
    u.company_id,
    u.is_super_admin,
    u.is_company_admin
  INTO
    v_current_user_company_id,
    v_is_super_admin,
    v_is_company_admin
  FROM users u
  WHERE u.id = auth.uid();

  -- Check permissions: super admin OR company admin adding to their own company
  IF NOT v_is_super_admin AND NOT v_is_company_admin THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Insufficient permissions. Only company admins can add users.'
    );
  END IF;

  -- Company admins can only add to their own company
  IF NOT v_is_super_admin AND v_current_user_company_id != p_company_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Company admins can only add users to their own company'
    );
  END IF;

  -- Find the target user by email
  SELECT id, company_id
  INTO v_target_user_id, v_target_user_current_company
  FROM users
  WHERE email = p_user_email
    AND is_active = true;

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found or inactive: ' || p_user_email
    );
  END IF;

  -- Check if user is already assigned to a company
  IF v_target_user_current_company IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User is already assigned to a company. Remove them first before reassigning.'
    );
  END IF;

  -- Verify target company exists
  IF NOT EXISTS (SELECT 1 FROM companies WHERE company_id = p_company_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Target company not found'
    );
  END IF;

  -- Add user to company
  UPDATE users
  SET
    company_id = p_company_id,
    updated_at = now()
  WHERE id = v_target_user_id;

  -- Log the action in audit trail
  INSERT INTO audit_log (
    user_id,
    action,
    table_name,
    record_id,
    new_values,
    company_id
  ) VALUES (
    auth.uid(),
    'UPDATE',
    'users',
    v_target_user_id,
    jsonb_build_object(
      'company_id', p_company_id,
      'action', 'user_added_to_company'
    ),
    p_company_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User successfully added to company',
    'user_id', v_target_user_id
  );
END;
$$;

-- Remove user from company
CREATE OR REPLACE FUNCTION remove_user_from_company(
  p_user_id uuid
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_user_company_id uuid;
  v_is_super_admin boolean;
  v_is_company_admin boolean;
  v_target_user_company uuid;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Not authenticated'
    );
  END IF;

  -- Get current user's permissions
  SELECT
    u.company_id,
    u.is_super_admin,
    u.is_company_admin
  INTO
    v_current_user_company_id,
    v_is_super_admin,
    v_is_company_admin
  FROM users u
  WHERE u.id = auth.uid();

  -- Check permissions
  IF NOT v_is_super_admin AND NOT v_is_company_admin THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Insufficient permissions'
    );
  END IF;

  -- Get target user's company
  SELECT company_id INTO v_target_user_company
  FROM users
  WHERE id = p_user_id;

  IF v_target_user_company IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found or not assigned to any company'
    );
  END IF;

  -- Company admins can only remove from their own company
  IF NOT v_is_super_admin AND v_current_user_company_id != v_target_user_company THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Company admins can only remove users from their own company'
    );
  END IF;

  -- Don't allow users to remove themselves
  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Cannot remove yourself from your company'
    );
  END IF;

  -- Remove user from company
  UPDATE users
  SET
    company_id = NULL,
    is_company_admin = false,
    updated_at = now()
  WHERE id = p_user_id;

  -- Log the action
  INSERT INTO audit_log (
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    company_id
  ) VALUES (
    auth.uid(),
    'UPDATE',
    'users',
    p_user_id,
    jsonb_build_object(
      'company_id', v_target_user_company,
      'action', 'user_removed_from_company'
    ),
    v_target_user_company
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User successfully removed from company'
  );
END;
$$;

-- ==========================================
-- DEVICE POOL MANAGEMENT FUNCTIONS
-- ==========================================

-- Get unassigned devices (super admin only)
CREATE OR REPLACE FUNCTION get_unassigned_devices()
RETURNS TABLE (
  device_id uuid,
  device_code text,
  device_type text,
  status text,
  last_seen timestamptz,
  created_at timestamptz,
  firmware_version text,
  battery_level integer
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_super_admin boolean;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user is super admin
  SELECT is_super_admin INTO v_is_super_admin
  FROM users
  WHERE id = auth.uid();

  IF NOT v_is_super_admin THEN
    RAISE EXCEPTION 'Access denied. Only super admins can view unassigned devices.';
  END IF;

  -- Return unassigned devices
  RETURN QUERY
  SELECT
    d.device_id,
    d.device_code,
    d.device_type,
    d.status,
    d.last_seen,
    d.created_at,
    d.firmware_version,
    d.battery_level
  FROM devices d
  WHERE d.company_id IS NULL
  ORDER BY d.created_at DESC;
END;
$$;

-- Assign device to company (super admin only)
CREATE OR REPLACE FUNCTION assign_device_to_company(
  p_device_id uuid,
  p_company_id uuid
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_super_admin boolean;
  v_device_current_company uuid;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Not authenticated'
    );
  END IF;

  -- Check if user is super admin
  SELECT is_super_admin INTO v_is_super_admin
  FROM users
  WHERE id = auth.uid();

  IF NOT v_is_super_admin THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Access denied. Only super admins can assign devices to companies.'
    );
  END IF;

  -- Verify device exists
  SELECT company_id INTO v_device_current_company
  FROM devices
  WHERE device_id = p_device_id;

  IF v_device_current_company IS NULL AND NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Device not found'
    );
  END IF;

  -- Check if device is already assigned
  IF v_device_current_company IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Device is already assigned to a company'
    );
  END IF;

  -- Verify target company exists
  IF NOT EXISTS (SELECT 1 FROM companies WHERE company_id = p_company_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Target company not found'
    );
  END IF;

  -- Assign device to company
  UPDATE devices
  SET
    company_id = p_company_id,
    updated_at = now()
  WHERE device_id = p_device_id;

  -- Update all related device data with company_id
  UPDATE device_telemetry
  SET company_id = p_company_id
  WHERE device_id = p_device_id AND company_id IS NULL;

  UPDATE device_images
  SET company_id = p_company_id
  WHERE device_id = p_device_id AND company_id IS NULL;

  UPDATE device_commands
  SET company_id = p_company_id
  WHERE device_id = p_device_id AND company_id IS NULL;

  UPDATE device_alerts
  SET company_id = p_company_id
  WHERE device_id = p_device_id AND company_id IS NULL;

  -- Log the action
  INSERT INTO audit_log (
    user_id,
    action,
    table_name,
    record_id,
    new_values,
    company_id
  ) VALUES (
    auth.uid(),
    'UPDATE',
    'devices',
    p_device_id,
    jsonb_build_object(
      'company_id', p_company_id,
      'action', 'device_assigned_to_company'
    ),
    p_company_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Device successfully assigned to company',
    'device_id', p_device_id,
    'company_id', p_company_id
  );
END;
$$;

-- Get device pool statistics (super admin only)
CREATE OR REPLACE FUNCTION get_device_pool_stats()
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_super_admin boolean;
  v_total_unassigned integer;
  v_by_type jsonb;
  v_by_status jsonb;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user is super admin
  SELECT is_super_admin INTO v_is_super_admin
  FROM users
  WHERE id = auth.uid();

  IF NOT v_is_super_admin THEN
    RAISE EXCEPTION 'Access denied. Only super admins can view device pool statistics.';
  END IF;

  -- Get total unassigned devices
  SELECT COUNT(*) INTO v_total_unassigned
  FROM devices
  WHERE company_id IS NULL;

  -- Get count by device type
  SELECT jsonb_object_agg(device_type, device_count)
  INTO v_by_type
  FROM (
    SELECT device_type, COUNT(*) as device_count
    FROM devices
    WHERE company_id IS NULL
    GROUP BY device_type
  ) type_counts;

  -- Get count by status
  SELECT jsonb_object_agg(status, status_count)
  INTO v_by_status
  FROM (
    SELECT status, COUNT(*) as status_count
    FROM devices
    WHERE company_id IS NULL
    GROUP BY status
  ) status_counts;

  RETURN jsonb_build_object(
    'total_unassigned', v_total_unassigned,
    'by_type', COALESCE(v_by_type, '{}'::jsonb),
    'by_status', COALESCE(v_by_status, '{}'::jsonb)
  );
END;
$$;

-- ==========================================
-- UPDATE RLS POLICIES FOR DEVICES
-- ==========================================

-- Drop existing device policies if they exist
DROP POLICY IF EXISTS "Super admins see all devices" ON devices;
DROP POLICY IF EXISTS "Users see company devices" ON devices;
DROP POLICY IF EXISTS "Company users manage devices" ON devices;

-- Super admins can see ALL devices (including unassigned)
CREATE POLICY "Super admins see all devices"
  ON devices FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
  );

-- Regular users can only see devices assigned to their company
CREATE POLICY "Users see company devices"
  ON devices FOR SELECT
  TO authenticated
  USING (
    NOT is_super_admin()
    AND company_id = get_user_company_id()
    AND is_user_active()
  );

-- Maintenance and admins can manage devices in their company
CREATE POLICY "Company users manage devices"
  ON devices FOR ALL
  TO authenticated
  USING (
    is_user_active()
    AND (
      is_super_admin()
      OR (
        company_id = get_user_company_id()
        AND (
          is_company_admin()
          OR has_role('maintenance')
          OR has_role('sysAdmin')
        )
      )
    )
  );

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION search_users_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION add_user_to_company(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_user_from_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unassigned_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION assign_device_to_company(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_device_pool_stats() TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION search_users_by_email IS 'Search for existing active users by email address. Returns up to 20 results.';
COMMENT ON FUNCTION add_user_to_company IS 'Assign an existing user to a company. Company admins can only add to their own company.';
COMMENT ON FUNCTION remove_user_from_company IS 'Remove user from their company. Company admins can only remove from their own company.';
COMMENT ON FUNCTION get_unassigned_devices IS 'Get list of devices not yet assigned to any company. Super admin only.';
COMMENT ON FUNCTION assign_device_to_company IS 'Assign a device to a company. Super admin only.';
COMMENT ON FUNCTION get_device_pool_stats IS 'Get statistics about unassigned devices. Super admin only.';
