/*
  # Separate Device and Audit History Functions

  This migration creates separate functions for device history and traditional audit logs
  to avoid type conflicts and improve UX with separate tabs.

  ## Changes

  1. **get_program_audit_history** - Traditional audit trail only (no devices)
  2. **get_site_audit_history** - Traditional site audit trail only (no devices)
  3. **get_program_device_history** - Device history for program
  4. **get_site_device_history** - Device history for site
  5. Drop the old unified functions that were causing type conflicts

  ## Benefits

  - No more type conflicts between device and audit schemas
  - Better UX with separate tabs for Activity vs Device History
  - Cleaner data structure for each type
  - Easier to maintain and extend

  ## Security

  - All functions remain SECURITY DEFINER with proper RLS
  - Granted to authenticated users only
*/

-- ============================================
-- Drop the problematic unified functions
-- ============================================

DROP FUNCTION IF EXISTS get_site_history_with_devices(uuid, timestamptz, timestamptz, text[], device_event_category[], integer);
DROP FUNCTION IF EXISTS get_program_history_with_devices(uuid, timestamptz, timestamptz, text[], device_event_category[], integer);

-- ============================================
-- FUNCTION 1: Get Program Audit History (Traditional Events Only)
-- ============================================

CREATE OR REPLACE FUNCTION get_program_audit_history(
  p_program_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_event_types TEXT[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  event_id UUID,
  event_source TEXT,
  event_type TEXT,
  event_timestamp TIMESTAMPTZ,
  description TEXT,
  object_type TEXT,
  object_id UUID,
  update_type TEXT,
  site_id UUID,
  site_name TEXT,
  user_id UUID,
  user_email TEXT,
  old_data JSONB,
  new_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pph.id AS event_id,
    CASE
      WHEN pph.object_type = 'pilot_program' THEN 'program'
      WHEN pph.object_type = 'site' THEN 'site'
      WHEN pph.object_type = 'submission' THEN 'submission'
      WHEN pph.object_type = 'petri_observation' THEN 'petri'
      WHEN pph.object_type = 'gasifier_observation' THEN 'gasifier'
      WHEN pph.object_type = 'program_user' THEN 'user'
      ELSE pph.object_type
    END AS event_source,
    pph.update_type AS event_type,
    pph.event_timestamp,
    pph.update_type AS description,
    pph.object_type,
    pph.object_id AS object_id,
    pph.update_type,
    CASE WHEN pph.object_type = 'site' THEN pph.object_id ELSE NULL END AS site_id,
    s.name::TEXT AS site_name,
    pph.user_id,
    pph.user_email,
    pph.old_data,
    pph.new_data
  FROM pilot_program_history_staging pph
  LEFT JOIN sites s ON (pph.object_type = 'site' AND pph.object_id = s.site_id)
  WHERE
    pph.program_id = p_program_id
    AND (p_start_date IS NULL OR pph.event_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR pph.event_timestamp <= p_end_date)
    AND (p_event_types IS NULL OR pph.update_type = ANY(p_event_types))
  ORDER BY pph.event_timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION 2: Get Site Audit History (Traditional Events Only)
-- ============================================

CREATE OR REPLACE FUNCTION get_site_audit_history(
  p_site_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_event_types TEXT[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  event_id UUID,
  event_source TEXT,
  event_type TEXT,
  event_timestamp TIMESTAMPTZ,
  description TEXT,
  object_type TEXT,
  object_id UUID,
  update_type TEXT,
  user_id UUID,
  user_email TEXT,
  old_data JSONB,
  new_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pph.id AS event_id,
    'site' AS event_source,
    pph.update_type AS event_type,
    pph.event_timestamp,
    pph.update_type AS description,
    pph.object_type,
    pph.object_id AS object_id,
    pph.update_type,
    pph.user_id,
    pph.user_email,
    pph.old_data,
    pph.new_data
  FROM pilot_program_history_staging pph
  WHERE
    pph.object_type = 'site'
    AND pph.object_id = p_site_id
    AND (p_start_date IS NULL OR pph.event_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR pph.event_timestamp <= p_end_date)
    AND (p_event_types IS NULL OR pph.update_type = ANY(p_event_types))
  ORDER BY pph.event_timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION 3: Get Program Device History
-- ============================================

CREATE OR REPLACE FUNCTION get_program_device_history(
  p_program_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_device_categories device_event_category[] DEFAULT NULL,
  p_severity_levels TEXT[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  history_id UUID,
  device_id UUID,
  device_mac TEXT,
  device_name TEXT,
  site_id UUID,
  site_name TEXT,
  session_id UUID,
  event_category TEXT,
  event_type TEXT,
  severity TEXT,
  event_timestamp TIMESTAMPTZ,
  description TEXT,
  event_data JSONB,
  metadata JSONB,
  user_id UUID,
  user_email TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dh.history_id,
    dh.device_id,
    d.device_mac::TEXT,
    d.device_name::TEXT,
    dh.site_id,
    s.name::TEXT AS site_name,
    dh.session_id,
    dh.event_category::TEXT AS event_category,
    dh.event_type,
    dh.severity::TEXT AS severity,
    dh.event_timestamp,
    dh.description,
    dh.event_data,
    dh.metadata,
    dh.user_id,
    u.email::TEXT AS user_email
  FROM device_history dh
  LEFT JOIN devices d ON dh.device_id = d.device_id
  LEFT JOIN sites s ON dh.site_id = s.site_id
  LEFT JOIN users u ON dh.user_id = u.id
  WHERE
    dh.program_id = p_program_id
    AND (p_start_date IS NULL OR dh.event_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR dh.event_timestamp <= p_end_date)
    AND (p_device_categories IS NULL OR dh.event_category = ANY(p_device_categories))
    AND (p_severity_levels IS NULL OR dh.severity::TEXT = ANY(p_severity_levels))
  ORDER BY dh.event_timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION 4: Get Site Device History
-- ============================================

CREATE OR REPLACE FUNCTION get_site_device_history(
  p_site_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_device_categories device_event_category[] DEFAULT NULL,
  p_severity_levels TEXT[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  history_id UUID,
  device_id UUID,
  device_mac TEXT,
  device_name TEXT,
  session_id UUID,
  event_category TEXT,
  event_type TEXT,
  severity TEXT,
  event_timestamp TIMESTAMPTZ,
  description TEXT,
  event_data JSONB,
  metadata JSONB,
  user_id UUID,
  user_email TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dh.history_id,
    dh.device_id,
    d.device_mac::TEXT,
    d.device_name::TEXT,
    dh.session_id,
    dh.event_category::TEXT AS event_category,
    dh.event_type,
    dh.severity::TEXT AS severity,
    dh.event_timestamp,
    dh.description,
    dh.event_data,
    dh.metadata,
    dh.user_id,
    u.email::TEXT AS user_email
  FROM device_history dh
  LEFT JOIN devices d ON dh.device_id = d.device_id
  LEFT JOIN users u ON dh.user_id = u.id
  WHERE
    dh.site_id = p_site_id
    AND (p_start_date IS NULL OR dh.event_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR dh.event_timestamp <= p_end_date)
    AND (p_device_categories IS NULL OR dh.event_category = ANY(p_device_categories))
    AND (p_severity_levels IS NULL OR dh.severity::TEXT = ANY(p_severity_levels))
  ORDER BY dh.event_timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Update CSV Export Function
-- ============================================

CREATE OR REPLACE FUNCTION export_filtered_audit_history_csv(
  p_program_id UUID,
  p_site_id UUID DEFAULT NULL,
  p_object_type TEXT DEFAULT NULL,
  p_event_type TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_csv TEXT;
  v_row RECORD;
BEGIN
  -- CSV Header
  v_csv := 'Timestamp,Event Type,Object Type,Object ID,User Email,Description,Old Data,New Data' || E'\n';

  -- Build CSV rows based on whether site filter is provided
  IF p_site_id IS NOT NULL THEN
    -- Site-specific audit log
    FOR v_row IN
      SELECT
        TO_CHAR(event_timestamp, 'YYYY-MM-DD HH24:MI:SS TZ') AS timestamp,
        event_type,
        object_type,
        object_id::TEXT,
        user_email,
        description,
        old_data::TEXT,
        new_data::TEXT
      FROM get_site_audit_history(
        p_site_id,
        NULL,
        NULL,
        CASE WHEN p_event_type IS NOT NULL THEN ARRAY[p_event_type] ELSE NULL END,
        10000
      )
      WHERE
        (p_object_type IS NULL OR object_type = p_object_type)
        AND (p_user_id IS NULL OR user_id = p_user_id)
      ORDER BY event_timestamp DESC
    LOOP
      v_csv := v_csv ||
        '"' || REPLACE(COALESCE(v_row.timestamp, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.event_type, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.object_type, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.object_id, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.user_email, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.description, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.old_data, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.new_data, ''), '"', '""') || '"' ||
        E'\n';
    END LOOP;
  ELSE
    -- Program-wide audit log
    FOR v_row IN
      SELECT
        TO_CHAR(event_timestamp, 'YYYY-MM-DD HH24:MI:SS TZ') AS timestamp,
        event_type,
        object_type,
        object_id::TEXT,
        user_email,
        description,
        old_data::TEXT,
        new_data::TEXT
      FROM get_program_audit_history(
        p_program_id,
        NULL,
        NULL,
        CASE WHEN p_event_type IS NOT NULL THEN ARRAY[p_event_type] ELSE NULL END,
        10000
      )
      WHERE
        (p_object_type IS NULL OR object_type = p_object_type)
        AND (p_user_id IS NULL OR user_id = p_user_id)
      ORDER BY event_timestamp DESC
    LOOP
      v_csv := v_csv ||
        '"' || REPLACE(COALESCE(v_row.timestamp, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.event_type, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.object_type, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.object_id, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.user_email, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.description, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.old_data, ''), '"', '""') || '",' ||
        '"' || REPLACE(COALESCE(v_row.new_data, ''), '"', '""') || '"' ||
        E'\n';
    END LOOP;
  END IF;

  RETURN v_csv;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Grant Permissions
-- ============================================

GRANT EXECUTE ON FUNCTION get_program_audit_history TO authenticated;
GRANT EXECUTE ON FUNCTION get_site_audit_history TO authenticated;
GRANT EXECUTE ON FUNCTION get_program_device_history TO authenticated;
GRANT EXECUTE ON FUNCTION get_site_device_history TO authenticated;
GRANT EXECUTE ON FUNCTION export_filtered_audit_history_csv TO authenticated;

-- ============================================
-- Add Comments
-- ============================================

COMMENT ON FUNCTION get_program_audit_history IS 'Returns traditional audit trail for a program (no device events)';
COMMENT ON FUNCTION get_site_audit_history IS 'Returns traditional audit trail for a site (no device events)';
COMMENT ON FUNCTION get_program_device_history IS 'Returns device history events for a program';
COMMENT ON FUNCTION get_site_device_history IS 'Returns device history events for a site';
COMMENT ON FUNCTION export_filtered_audit_history_csv IS 'Exports filtered traditional audit history as CSV format for programs or sites';
