/*
  # Fix Device Pool Functions - Remove Non-Existent Columns

  1. Purpose
    - Fix get_unassigned_devices() to match actual devices table schema
    - Remove references to: device_type, status, battery_level
    - Use actual columns: hardware_version, provisioning_status, battery_health_percent

  2. Changes
    - Update get_unassigned_devices return type and query
    - Fix column mappings to match devices table
*/

-- ==========================================
-- Fix get_unassigned_devices Function
-- ==========================================

CREATE OR REPLACE FUNCTION get_unassigned_devices()
RETURNS TABLE (
  device_id uuid,
  device_code text,
  device_name text,
  hardware_version text,
  provisioning_status text,
  last_seen_at timestamptz,
  created_at timestamptz,
  firmware_version text,
  battery_health_percent integer,
  battery_voltage numeric,
  wifi_ssid text
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

  -- Return unassigned devices (company_id IS NULL)
  RETURN QUERY
  SELECT
    d.device_id,
    d.device_code,
    d.device_name,
    d.hardware_version,
    d.provisioning_status,
    d.last_seen_at,
    d.created_at,
    d.firmware_version,
    d.battery_health_percent,
    d.battery_voltage,
    d.wifi_ssid
  FROM devices d
  WHERE d.company_id IS NULL
    AND d.is_active = true
  ORDER BY d.created_at DESC;
END;
$$;

COMMENT ON FUNCTION get_unassigned_devices IS
'Returns all unassigned devices (company_id IS NULL) for super admins. Fixed to use actual devices table columns.';

-- ==========================================
-- Fix get_device_pool_stats Function
-- ==========================================

CREATE OR REPLACE FUNCTION get_device_pool_stats()
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_super_admin boolean;
  v_total_unassigned integer;
  v_pending_mapping integer;
  v_active integer;
  v_inactive integer;
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

  -- Get statistics
  SELECT COUNT(*) INTO v_total_unassigned
  FROM devices
  WHERE company_id IS NULL;

  SELECT COUNT(*) INTO v_pending_mapping
  FROM devices
  WHERE company_id IS NULL
    AND provisioning_status = 'pending_mapping';

  SELECT COUNT(*) INTO v_active
  FROM devices
  WHERE company_id IS NULL
    AND is_active = true;

  SELECT COUNT(*) INTO v_inactive
  FROM devices
  WHERE company_id IS NULL
    AND is_active = false;

  RETURN jsonb_build_object(
    'total_unassigned', v_total_unassigned,
    'pending_mapping', v_pending_mapping,
    'active', v_active,
    'inactive', v_inactive
  );
END;
$$;

COMMENT ON FUNCTION get_device_pool_stats IS
'Returns statistics about unassigned devices for super admins. Fixed to use actual devices table columns.';
