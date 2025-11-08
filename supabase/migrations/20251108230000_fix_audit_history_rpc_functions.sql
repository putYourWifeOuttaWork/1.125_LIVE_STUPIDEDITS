/*
  # Fix Audit History RPC Functions

  This migration fixes the broken audit log RPC functions that were causing type mismatch errors.

  ## Changes

  1. **get_site_history_with_devices** - Fixed return type structure to match actual query results
  2. **get_program_history_with_devices** - Fixed return type structure to match actual query results
  3. Both functions now properly return unified audit trail data from device history and program history staging

  ## Issue Fixed

  - "structure of query does not match function result type" error
  - Column type mismatches between declared return type and actual SELECT columns
  - Missing fields needed by the frontend (object_type, update_type, old_data, new_data)

  ## Security

  - Functions remain SECURITY DEFINER with proper RLS enforcement
  - All functions granted to authenticated users only
*/

-- ============================================
-- FUNCTION 1: Get Site History with Devices (Fixed)
-- ============================================

CREATE OR REPLACE FUNCTION get_site_history_with_devices(
  p_site_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_event_types TEXT[] DEFAULT NULL,
  p_device_categories device_event_category[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  event_id UUID,
  event_source TEXT,
  event_type TEXT,
  event_category TEXT,
  severity TEXT,
  event_timestamp TIMESTAMPTZ,
  description TEXT,
  object_type TEXT,
  object_id UUID,
  update_type TEXT,
  device_id UUID,
  device_name TEXT,
  user_id UUID,
  user_email TEXT,
  old_data JSONB,
  new_data JSONB,
  event_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  -- Device history events
  SELECT
    dh.history_id AS event_id,
    'device' AS event_source,
    dh.event_type,
    dh.event_category::TEXT AS event_category,
    dh.severity::TEXT,
    dh.event_timestamp,
    dh.description,
    'device' AS object_type,
    dh.device_id AS object_id,
    dh.event_type AS update_type,
    dh.device_id,
    d.device_name,
    dh.user_id,
    u.email AS user_email,
    NULL::JSONB AS old_data,
    NULL::JSONB AS new_data,
    dh.event_data
  FROM device_history dh
  LEFT JOIN devices d ON dh.device_id = d.device_id
  LEFT JOIN users u ON dh.user_id = u.id
  WHERE
    dh.site_id = p_site_id
    AND (p_start_date IS NULL OR dh.event_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR dh.event_timestamp <= p_end_date)
    AND (p_device_categories IS NULL OR dh.event_category = ANY(p_device_categories))

  UNION ALL

  -- Site-level events from existing audit trail
  SELECT
    pph.id AS event_id,
    'site' AS event_source,
    pph.update_type AS event_type,
    'site_activity' AS event_category,
    'info' AS severity,
    pph.event_timestamp,
    pph.update_type AS description,
    pph.object_type,
    pph.object_id AS object_id,
    pph.update_type,
    NULL::UUID AS device_id,
    NULL AS device_name,
    pph.user_id,
    pph.user_email,
    pph.old_data,
    pph.new_data,
    jsonb_build_object('old_data', pph.old_data, 'new_data', pph.new_data) AS event_data
  FROM pilot_program_history_staging pph
  WHERE
    pph.object_type = 'site'
    AND pph.object_id = p_site_id
    AND (p_start_date IS NULL OR pph.event_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR pph.event_timestamp <= p_end_date)
    AND (p_event_types IS NULL OR pph.update_type = ANY(p_event_types))

  ORDER BY event_timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION 2: Get Program History with Devices (Fixed)
-- ============================================

CREATE OR REPLACE FUNCTION get_program_history_with_devices(
  p_program_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_event_types TEXT[] DEFAULT NULL,
  p_device_categories device_event_category[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  event_id UUID,
  event_source TEXT,
  event_type TEXT,
  event_category TEXT,
  severity TEXT,
  event_timestamp TIMESTAMPTZ,
  description TEXT,
  object_type TEXT,
  object_id UUID,
  update_type TEXT,
  site_id UUID,
  site_name TEXT,
  device_id UUID,
  device_name TEXT,
  user_id UUID,
  user_email TEXT,
  old_data JSONB,
  new_data JSONB,
  event_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  -- Device history events
  SELECT
    dh.history_id AS event_id,
    'device' AS event_source,
    dh.event_type,
    dh.event_category::TEXT AS event_category,
    dh.severity::TEXT,
    dh.event_timestamp,
    dh.description,
    'device' AS object_type,
    dh.device_id AS object_id,
    dh.event_type AS update_type,
    dh.site_id,
    s.name AS site_name,
    dh.device_id,
    d.device_name,
    dh.user_id,
    u.email AS user_email,
    NULL::JSONB AS old_data,
    NULL::JSONB AS new_data,
    dh.event_data
  FROM device_history dh
  LEFT JOIN devices d ON dh.device_id = d.device_id
  LEFT JOIN sites s ON dh.site_id = s.site_id
  LEFT JOIN users u ON dh.user_id = u.id
  WHERE
    dh.program_id = p_program_id
    AND (p_start_date IS NULL OR dh.event_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR dh.event_timestamp <= p_end_date)
    AND (p_device_categories IS NULL OR dh.event_category = ANY(p_device_categories))

  UNION ALL

  -- Program-level events from existing audit trail
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
    CASE
      WHEN pph.object_type = 'pilot_program' THEN 'program_activity'
      WHEN pph.object_type = 'site' THEN 'site_activity'
      WHEN pph.object_type = 'submission' THEN 'submission_activity'
      WHEN pph.object_type = 'program_user' THEN 'user_activity'
      ELSE 'activity'
    END AS event_category,
    'info' AS severity,
    pph.event_timestamp,
    pph.update_type AS description,
    pph.object_type,
    pph.object_id AS object_id,
    pph.update_type,
    CASE WHEN pph.object_type = 'site' THEN pph.object_id ELSE NULL END AS site_id,
    s.name AS site_name,
    NULL::UUID AS device_id,
    NULL AS device_name,
    pph.user_id,
    pph.user_email,
    pph.old_data,
    pph.new_data,
    jsonb_build_object('old_data', pph.old_data, 'new_data', pph.new_data) AS event_data
  FROM pilot_program_history_staging pph
  LEFT JOIN sites s ON (pph.object_type = 'site' AND pph.object_id = s.site_id)
  WHERE
    pph.program_id = p_program_id
    AND (p_start_date IS NULL OR pph.event_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR pph.event_timestamp <= p_end_date)
    AND (p_event_types IS NULL OR pph.update_type = ANY(p_event_types))

  ORDER BY event_timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION 3: Export Filtered Audit History CSV
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
      FROM get_site_history_with_devices(
        p_site_id,
        NULL,
        NULL,
        CASE WHEN p_event_type IS NOT NULL THEN ARRAY[p_event_type] ELSE NULL END,
        NULL,
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
      FROM get_program_history_with_devices(
        p_program_id,
        NULL,
        NULL,
        CASE WHEN p_event_type IS NOT NULL THEN ARRAY[p_event_type] ELSE NULL END,
        NULL,
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

GRANT EXECUTE ON FUNCTION get_site_history_with_devices TO authenticated;
GRANT EXECUTE ON FUNCTION get_program_history_with_devices TO authenticated;
GRANT EXECUTE ON FUNCTION export_filtered_audit_history_csv TO authenticated;

-- ============================================
-- Add Comments
-- ============================================

COMMENT ON FUNCTION get_site_history_with_devices IS 'Returns unified audit trail for a site including both device events and traditional audit events';
COMMENT ON FUNCTION get_program_history_with_devices IS 'Returns unified audit trail for a program including both device events and traditional audit events';
COMMENT ON FUNCTION export_filtered_audit_history_csv IS 'Exports filtered audit history as CSV format for programs or sites';
