/*
  # Device-Site Assignment Functions
  
  1. Purpose
    - Enable visual device pool management and site mapping
    - Support drag-and-drop device assignment with spatial coordinates
    - Foundation for session analytics and snapshot visualization
    
  2. Functions
    - fn_get_available_devices_for_site: Get devices available for assignment
    - fn_assign_device_to_site: Assign device to site with coordinates
    - fn_update_device_position: Update device spatial position
    - fn_remove_device_from_site: Return device to company pool
    
  3. Architecture Notes
    - Devices must belong to same company as site
    - Device inherits program_id from site automatically (via trigger)
    - Supports session snapshot visualization with device positions
    - Enables spatial analytics and heatmaps
*/

-- ==========================================
-- FUNCTION: Get Available Devices for Site Assignment
-- ==========================================

CREATE OR REPLACE FUNCTION fn_get_available_devices_for_site(
  p_site_id UUID
)
RETURNS TABLE (
  device_id UUID,
  device_code TEXT,
  device_name TEXT,
  device_mac TEXT,
  device_type TEXT,
  provisioning_status TEXT,
  status TEXT,
  battery_level INTEGER,
  last_seen TIMESTAMPTZ,
  firmware_version TEXT,
  is_currently_assigned BOOLEAN,
  current_site_id UUID,
  current_site_name TEXT,
  x_position INTEGER,
  y_position INTEGER
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_site_company_id UUID;
  v_site_program_id UUID;
BEGIN
  -- Get site's company and program
  SELECT company_id, program_id
  INTO v_site_company_id, v_site_program_id
  FROM sites
  WHERE site_id = p_site_id;
  
  IF v_site_company_id IS NULL THEN
    RAISE EXCEPTION 'Site not found or invalid';
  END IF;
  
  -- Return devices that:
  -- 1. Belong to same company
  -- 2. Are either unassigned OR assigned to THIS site (for editing)
  -- 3. Are not system/virtual devices (unless specifically allowed)
  RETURN QUERY
  SELECT
    d.device_id,
    d.device_code,
    d.device_name,
    d.device_mac,
    d.device_type,
    d.provisioning_status,
    d.status,
    d.battery_level,
    d.last_seen,
    d.firmware_version,
    (d.site_id IS NOT NULL) as is_currently_assigned,
    d.site_id as current_site_id,
    s.name as current_site_name,
    d.x_position,
    d.y_position
  FROM devices d
  LEFT JOIN sites s ON s.site_id = d.site_id
  WHERE d.company_id = v_site_company_id
    AND (d.site_id IS NULL OR d.site_id = p_site_id)
    AND d.device_type IN ('physical', 'virtual')
    AND d.provisioning_status IN ('approved', 'active', 'pending_approval')
  ORDER BY 
    d.site_id IS NULL DESC,
    d.device_code ASC;
END;
$$;

-- ==========================================
-- FUNCTION: Assign Device to Site with Coordinates
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
    updated_at = now()
  WHERE device_id = p_device_id;
  
  -- Log to audit trail
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
      'action', 'device_assigned_to_site',
      'device_code', v_device_code,
      'site_id', p_site_id,
      'site_name', v_site_name,
      'x_position', p_x_position,
      'y_position', p_y_position
    ),
    v_site_company_id
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
-- FUNCTION: Update Device Position on Site Map
-- ==========================================

CREATE OR REPLACE FUNCTION fn_update_device_position(
  p_device_id UUID,
  p_x_position INTEGER,
  p_y_position INTEGER
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_device_site_id UUID;
  v_device_code TEXT;
BEGIN
  -- Get device info
  SELECT site_id, device_code
  INTO v_device_site_id, v_device_code
  FROM devices
  WHERE device_id = p_device_id;
  
  IF v_device_site_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Device must be assigned to a site before setting position'
    );
  END IF;
  
  -- Update position
  UPDATE devices
  SET
    x_position = p_x_position,
    y_position = p_y_position,
    updated_at = now()
  WHERE device_id = p_device_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Device position updated',
    'device_id', p_device_id,
    'x_position', p_x_position,
    'y_position', p_y_position
  );
END;
$$;

-- ==========================================
-- FUNCTION: Remove Device from Site (Return to Pool)
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
  
  -- Remove site assignment and clear position
  -- Note: device remains in company pool, keeps company_id
  UPDATE devices
  SET
    site_id = NULL,
    program_id = NULL,
    x_position = NULL,
    y_position = NULL,
    updated_at = now()
  WHERE device_id = p_device_id;
  
  -- Log to audit trail
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
      'action', 'device_removed_from_site',
      'device_code', v_device_code,
      'old_site_id', v_old_site_id,
      'old_site_name', v_site_name
    ),
    v_company_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Device removed from site and returned to company pool',
    'device_id', p_device_id
  );
END;
$$;

-- ==========================================
-- COMMENTS
-- ==========================================

COMMENT ON FUNCTION fn_get_available_devices_for_site(UUID) IS
  'Returns devices available for assignment to a site - includes unassigned devices in same company';

COMMENT ON FUNCTION fn_assign_device_to_site(UUID, UUID, INTEGER, INTEGER) IS
  'Assigns device to site with optional x,y coordinates - program_id inherited automatically';

COMMENT ON FUNCTION fn_update_device_position(UUID, INTEGER, INTEGER) IS
  'Updates device position on site map - used for drag-and-drop repositioning';

COMMENT ON FUNCTION fn_remove_device_from_site(UUID) IS
  'Removes device from site and returns it to company pool - preserves company_id';
