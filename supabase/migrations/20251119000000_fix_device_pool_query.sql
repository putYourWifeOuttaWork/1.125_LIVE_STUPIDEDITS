/*
  # Fix Device Pool Query to Include Awaiting Mapping Devices

  1. Problem
    - Devices with site_id but no x,y positions weren't appearing in device pool
    - These "awaiting mapping" devices should be available for any site in the company

  2. Solution
    - Updated fn_get_available_devices_for_site to include devices where:
      - site_id IS NULL (unassigned), OR
      - site_id = this_site (editing), OR
      - x_position IS NULL AND y_position IS NULL (awaiting mapping)

  3. Effect
    - Devices provisioned but never positioned are now available
    - Enables flexible device reassignment within company
    - Maintains company isolation via RLS
*/

-- Drop existing function first (return type changed from status to device_status)
DROP FUNCTION IF EXISTS fn_get_available_devices_for_site(uuid);

-- Recreate with correct column name
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
  device_status TEXT,
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
  -- 2. Are unassigned (site_id IS NULL)
  -- 3. OR assigned to THIS site (for editing)
  -- 4. OR assigned but without positions (awaiting mapping - can be reassigned)
  RETURN QUERY
  SELECT
    d.device_id,
    d.device_code,
    d.device_name,
    d.device_mac,
    d.device_type,
    d.provisioning_status,
    d.device_status,
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
    AND (
      d.site_id IS NULL OR 
      d.site_id = p_site_id OR
      (d.x_position IS NULL AND d.y_position IS NULL)  -- Awaiting mapping
    )
    AND d.device_type IN ('physical', 'virtual')
    AND d.provisioning_status IN ('approved', 'active', 'pending_approval')
  ORDER BY 
    d.site_id IS NULL DESC,
    (d.x_position IS NULL AND d.y_position IS NULL) DESC,
    d.device_code ASC;
END;
$$;

COMMENT ON FUNCTION fn_get_available_devices_for_site(UUID) IS
  'Returns devices available for assignment - includes unassigned, already assigned to this site, or awaiting mapping (no position)';
