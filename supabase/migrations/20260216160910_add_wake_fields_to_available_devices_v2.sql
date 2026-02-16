/*
  # Add wake fields to fn_get_available_devices_for_site

  1. Modified Functions
    - `fn_get_available_devices_for_site(p_site_id UUID)`
      - Drops and recreates with additional return columns: `last_wake_at`, `wake_schedule_cron`
      - These fields enable the wake-based Active/Warning/Inactive status badge

  2. Important Notes
    - Function is dropped and recreated (safe, no data loss)
    - Existing callers receive additional fields (non-breaking for JS consumers)
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'fn_get_available_devices_for_site'
  ) THEN
    DROP FUNCTION fn_get_available_devices_for_site(UUID);
  END IF;
END $$;

CREATE FUNCTION fn_get_available_devices_for_site(p_site_id UUID)
RETURNS TABLE (
  device_id UUID,
  device_code TEXT,
  device_name TEXT,
  device_mac TEXT,
  device_type TEXT,
  provisioning_status TEXT,
  device_status TEXT,
  battery_level INT,
  last_seen TIMESTAMPTZ,
  firmware_version TEXT,
  is_currently_assigned BOOLEAN,
  current_site_id UUID,
  current_site_name TEXT,
  x_position INT,
  y_position INT,
  last_wake_at TIMESTAMPTZ,
  wake_schedule_cron TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_site_company_id UUID;
  v_site_program_id UUID;
BEGIN
  SELECT s.company_id, s.program_id
  INTO v_site_company_id, v_site_program_id
  FROM sites s
  WHERE s.site_id = p_site_id;

  IF v_site_company_id IS NULL THEN
    RAISE EXCEPTION 'Site not found or invalid';
  END IF;

  RETURN QUERY
  SELECT
    d.device_id,
    CAST(d.device_code AS TEXT),
    CAST(d.device_name AS TEXT),
    CAST(d.device_mac AS TEXT),
    CAST(d.device_type AS TEXT),
    CAST(d.provisioning_status AS TEXT),
    CASE
      WHEN NOT d.is_active THEN 'inactive'
      WHEN d.provisioning_status = 'system' THEN 'system'
      WHEN d.site_id IS NULL AND d.program_id IS NULL THEN 'unassigned'
      WHEN d.site_id IS NOT NULL AND (d.x_position IS NULL OR d.y_position IS NULL) THEN 'awaiting_mapping'
      WHEN d.site_id IS NOT NULL AND d.program_id IS NOT NULL THEN 'active'
      ELSE 'available'
    END::TEXT,
    CAST(COALESCE(d.battery_health_percent, 0) AS INTEGER),
    d.last_seen_at,
    CAST(d.firmware_version AS TEXT),
    (d.site_id IS NOT NULL),
    d.site_id,
    CAST(site_ref.name AS TEXT),
    CAST(d.x_position AS INTEGER),
    CAST(d.y_position AS INTEGER),
    d.last_wake_at,
    d.wake_schedule_cron
  FROM devices d
  LEFT JOIN sites site_ref ON site_ref.site_id = d.site_id
  WHERE d.company_id = v_site_company_id
    AND (
      d.site_id IS NULL OR
      d.site_id = p_site_id OR
      (d.x_position IS NULL AND d.y_position IS NULL)
    )
    AND d.device_type IN ('physical', 'virtual')
    AND d.provisioning_status IN ('approved', 'active', 'pending_approval', 'pending_mapping', 'mapped')
    AND d.is_active = true
  ORDER BY
    d.site_id IS NULL DESC,
    (d.x_position IS NULL AND d.y_position IS NULL) DESC,
    d.device_code ASC;
END;
$$;
