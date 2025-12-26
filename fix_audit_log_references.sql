/*
  # Fix audit_log References in Device Assignment Functions

  1. Problem
    - fn_assign_device_to_site() and fn_remove_device_from_site() try to INSERT into audit_log table
    - audit_log table doesn't exist
    - This causes error: relation "audit_log" does not exist

  2. Solution
    - Remove audit_log INSERT statements from device assignment functions
    - Device history already logs these changes via triggers on device_history table
    - No need for duplicate logging

  3. Changes
    - Recreate fn_assign_device_to_site without audit_log insert
    - Recreate fn_remove_device_from_site without audit_log insert
*/

-- ==========================================
-- FIX: fn_assign_device_to_site (remove audit_log)
-- ==========================================

CREATE OR REPLACE FUNCTION fn_assign_device_to_site(
  p_device_id UUID,
  p_site_id UUID,
  p_x_position INTEGER DEFAULT NULL,
  p_y_position INTEGER DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_device_company_id UUID;
  v_site_company_id UUID;
  v_site_program_id UUID;
  v_device_code TEXT;
  v_site_name TEXT;
  v_current_user_id UUID := auth.uid();
BEGIN
  -- Get device info
  SELECT company_id, device_code
  INTO v_device_company_id, v_device_code
  FROM devices
  WHERE device_id = p_device_id;

  IF v_device_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Device not found'
    );
  END IF;

  -- Get site info
  SELECT company_id, program_id, name
  INTO v_site_company_id, v_site_program_id, v_site_name
  FROM sites
  WHERE site_id = p_site_id;

  IF v_site_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Site not found'
    );
  END IF;

  -- Verify same company
  IF v_device_company_id != v_site_company_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Device and site must belong to same company'
    );
  END IF;

  -- Check if device is already assigned to this site
  IF EXISTS (
    SELECT 1 FROM device_site_assignments
    WHERE device_id = p_device_id
    AND site_id = p_site_id
    AND is_active = true
  ) THEN
    -- Just update position if provided
    IF p_x_position IS NOT NULL OR p_y_position IS NOT NULL THEN
      UPDATE devices
      SET
        x_position = COALESCE(p_x_position, x_position),
        y_position = COALESCE(p_y_position, y_position),
        updated_at = now()
      WHERE device_id = p_device_id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Device already assigned to site. Position updated if provided.',
      'device_id', p_device_id,
      'site_id', p_site_id,
      'program_id', v_site_program_id
    );
  END IF;

  -- Deactivate any existing active assignments for this device
  UPDATE device_site_assignments
  SET is_active = false, unassigned_at = now(), unassigned_by_user_id = v_current_user_id
  WHERE device_id = p_device_id AND is_active = true;

  -- Create new junction table assignment
  INSERT INTO device_site_assignments (
    device_id, site_id, program_id, is_primary, is_active, assigned_by_user_id
  ) VALUES (
    p_device_id, p_site_id, v_site_program_id, true, true, v_current_user_id
  );

  -- Update cached values in devices table
  UPDATE devices
  SET
      site_id = p_site_id,
      program_id = v_site_program_id,
      x_position = COALESCE(p_x_position, x_position),
      y_position = COALESCE(p_y_position, y_position),
      updated_at = now()
  WHERE device_id = p_device_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Device assigned to site successfully',
    'device_id', p_device_id,
    'site_id', p_site_id,
    'program_id', v_site_program_id
  );
END;
$$;

-- ==========================================
-- FIX: fn_remove_device_from_site (remove audit_log)
-- ==========================================

CREATE OR REPLACE FUNCTION fn_remove_device_from_site(
  p_device_id UUID
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_device_code TEXT;
  v_old_site_id UUID;
  v_site_name TEXT;
  v_company_id UUID;
  v_current_user_id UUID := auth.uid();
BEGIN
  -- Get current device assignment
  SELECT
    d.device_code,
    d.site_id,
    d.company_id,
    s.name
  INTO
    v_device_code,
    v_old_site_id,
    v_company_id,
    v_site_name
  FROM devices d
  LEFT JOIN sites s ON s.site_id = d.site_id
  WHERE d.device_id = p_device_id;

  IF v_device_code IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Device not found'
    );
  END IF;

  IF v_old_site_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Device is not assigned to any site'
    );
  END IF;

  -- Deactivate all active assignments for this device
  UPDATE device_site_assignments
  SET is_active = false, unassigned_at = now(), unassigned_by_user_id = v_current_user_id
  WHERE device_id = p_device_id AND is_active = true;

  -- Clear cached assignment from devices table
  UPDATE devices
  SET site_id = NULL, program_id = NULL, x_position = NULL, y_position = NULL, updated_at = now()
  WHERE device_id = p_device_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Device removed from site and returned to company pool',
    'device_id', p_device_id
  );
END;
$$;

COMMENT ON FUNCTION fn_assign_device_to_site(UUID, UUID, INTEGER, INTEGER) IS
  'Assigns device to site with optional x,y coordinates. Creates junction table entry. Device history logged by trigger.';

COMMENT ON FUNCTION fn_remove_device_from_site(UUID) IS
  'Removes device from site and returns it to company pool. Deactivates junction entries. Device history logged by trigger.';
