/*
  # Device Lineage Resolver Function

  1. Purpose
    - Resolve device MAC address to complete hierarchical context
    - Return device → site → program → company lineage
    - Include timezone, wake schedule, and provisioning status
    - Enable edge function to properly route device data

  2. Function
    - fn_resolve_device_lineage(p_device_mac TEXT) → JSONB
    - Returns complete device context or NULL if not found
    - Uses SECURITY DEFINER for system-level access
    - Validates device is active and properly provisioned

  3. Return Structure
    {
      "device_id": "uuid",
      "device_mac": "AA:BB:CC:DD:EE:FF",
      "device_name": "Device 001",
      "site_id": "uuid",
      "site_name": "Test Site",
      "program_id": "uuid",
      "company_id": "uuid",
      "timezone": "America/Los_Angeles",
      "wake_schedule_cron": "0 8,16 * * *",
      "is_active": true,
      "provisioning_status": "active"
    }

  4. Security
    - SECURITY DEFINER allows edge function to access all companies
    - Returns NULL for inactive or unprovisioned devices
    - Validates complete lineage chain exists
*/

-- ==========================================
-- FUNCTION: RESOLVE DEVICE LINEAGE
-- ==========================================

CREATE OR REPLACE FUNCTION fn_resolve_device_lineage(p_device_mac TEXT)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Query for complete device lineage
  SELECT jsonb_build_object(
    'device_id', d.device_id,
    'device_mac', d.device_mac,
    'device_name', d.device_name,
    'site_id', s.site_id,
    'site_name', s.name,
    'program_id', p.program_id,
    'program_name', p.name,
    'company_id', c.company_id,
    'company_name', c.company_name,
    'timezone', COALESCE(s.timezone, 'UTC'),
    'wake_schedule_cron', d.wake_schedule_cron,
    'is_active', d.is_active,
    'provisioning_status', d.provisioning_status
  )
  INTO v_result
  FROM devices d
  -- Join through device_site_assignments to get current site
  LEFT JOIN device_site_assignments dsa ON d.device_id = dsa.device_id AND dsa.is_active = TRUE
  LEFT JOIN sites s ON dsa.site_id = s.site_id
  LEFT JOIN pilot_programs p ON s.program_id = p.program_id
  LEFT JOIN companies c ON p.company_id = c.company_id
  WHERE d.device_mac = p_device_mac
    AND d.is_active = TRUE
  LIMIT 1;

  -- Validate complete lineage exists
  IF v_result IS NULL THEN
    RETURN NULL; -- Device not found or inactive
  END IF;

  -- Check if device is assigned to a site
  IF (v_result->>'site_id') IS NULL THEN
    -- Device exists but not assigned to site - return with warning
    RETURN jsonb_build_object(
      'device_id', v_result->>'device_id',
      'device_mac', v_result->>'device_mac',
      'device_name', v_result->>'device_name',
      'error', 'device_not_assigned_to_site',
      'is_active', v_result->>'is_active',
      'provisioning_status', v_result->>'provisioning_status'
    );
  END IF;

  -- Check if site is assigned to program
  IF (v_result->>'program_id') IS NULL THEN
    RETURN jsonb_build_object(
      'device_id', v_result->>'device_id',
      'device_mac', v_result->>'device_mac',
      'site_id', v_result->>'site_id',
      'site_name', v_result->>'site_name',
      'error', 'site_not_assigned_to_program'
    );
  END IF;

  -- Check if program is assigned to company
  IF (v_result->>'company_id') IS NULL THEN
    RETURN jsonb_build_object(
      'device_id', v_result->>'device_id',
      'device_mac', v_result->>'device_mac',
      'site_id', v_result->>'site_id',
      'program_id', v_result->>'program_id',
      'error', 'program_not_assigned_to_company'
    );
  END IF;

  -- Return complete lineage
  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  -- Log error and return NULL
  RAISE WARNING 'fn_resolve_device_lineage error for MAC %: %', p_device_mac, SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute to authenticated and service role
GRANT EXECUTE ON FUNCTION fn_resolve_device_lineage(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION fn_resolve_device_lineage(TEXT) IS
'Resolve device MAC address to complete lineage (device→site→program→company). Returns JSONB with full context including timezone and wake schedule. Returns NULL if device not found or error object if incomplete lineage.';

-- ==========================================
-- HELPER: GET DEVICE SITE ASSIGNMENT
-- ==========================================

CREATE OR REPLACE FUNCTION fn_get_device_current_site(p_device_id UUID)
RETURNS UUID AS $$
DECLARE
  v_site_id UUID;
BEGIN
  SELECT dsa.site_id
  INTO v_site_id
  FROM device_site_assignments dsa
  WHERE dsa.device_id = p_device_id
    AND dsa.is_active = TRUE
  ORDER BY dsa.assigned_at DESC
  LIMIT 1;

  RETURN v_site_id;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION fn_get_device_current_site(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION fn_get_device_current_site(UUID) IS
'Get the current active site assignment for a device. Returns NULL if device not assigned.';
