/*
  # Fix Device Assignment Functions - Remove Audit Log Dependency

  1. Problem
    - fn_assign_device_to_site and fn_remove_device_from_site reference non-existent audit_log table
    - Should use device_history table instead for audit trail

  2. Solution
    - Update both functions to use device_history table
    - Maintain audit trail using existing schema

  3. Effect
    - Device assignment now works without errors
    - Proper audit trail in device_history table
*/

-- ==========================================
-- FUNCTION: Assign Device to Site (Fixed)
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

  -- Update device assignment
  -- Note: program_id will be auto-populated by trigger
  UPDATE devices
  SET
    site_id = p_site_id,
    x_position = COALESCE(p_x_position, x_position),
    y_position = COALESCE(p_y_position, y_position),
    mapped_at = now(),
    mapped_by_user_id = auth.uid(),
    provisioning_status = 'mapped',
    updated_at = now()
  WHERE device_id = p_device_id;

  -- Log to device history
  INSERT INTO device_history (
    device_id,
    site_id,
    program_id,
    event_category,
    event_type,
    severity,
    description,
    event_data,
    user_id,
    company_id,
    triggered_by
  ) VALUES (
    p_device_id,
    p_site_id,
    v_site_program_id,
    'configuration',
    'device_assigned_to_site',
    'info',
    'Device ' || v_device_code || ' assigned to site ' || v_site_name,
    jsonb_build_object(
      'device_code', v_device_code,
      'site_id', p_site_id,
      'site_name', v_site_name,
      'x_position', p_x_position,
      'y_position', p_y_position
    ),
    auth.uid(),
    v_site_company_id,
    'user'
  );

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
-- FUNCTION: Remove Device from Site (Fixed)
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
  v_old_program_id UUID;
  v_site_name TEXT;
  v_company_id UUID;
BEGIN
  -- Get current device assignment
  SELECT
    d.device_code,
    d.site_id,
    d.program_id,
    d.company_id,
    s.name
  INTO
    v_device_code,
    v_old_site_id,
    v_old_program_id,
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

  -- Remove site assignment and clear position
  -- Note: device remains in company pool, keeps company_id
  UPDATE devices
  SET
    site_id = NULL,
    program_id = NULL,
    x_position = NULL,
    y_position = NULL,
    provisioning_status = 'pending_mapping',
    updated_at = now()
  WHERE device_id = p_device_id;

  -- Log to device history
  INSERT INTO device_history (
    device_id,
    site_id,
    program_id,
    event_category,
    event_type,
    severity,
    description,
    event_data,
    user_id,
    company_id,
    triggered_by
  ) VALUES (
    p_device_id,
    v_old_site_id,
    v_old_program_id,
    'configuration',
    'device_removed_from_site',
    'info',
    'Device ' || v_device_code || ' removed from site ' || v_site_name,
    jsonb_build_object(
      'device_code', v_device_code,
      'old_site_id', v_old_site_id,
      'old_site_name', v_site_name
    ),
    auth.uid(),
    v_company_id,
    'user'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Device removed from site and returned to company pool',
    'device_id', p_device_id
  );
END;
$$;

COMMENT ON FUNCTION fn_assign_device_to_site(UUID, UUID, INTEGER, INTEGER) IS
  'Assigns device to site with optional x,y coordinates - logs to device_history';

COMMENT ON FUNCTION fn_remove_device_from_site(UUID) IS
  'Removes device from site and returns it to company pool - logs to device_history';
