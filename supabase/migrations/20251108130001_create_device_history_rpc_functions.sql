/*
  # Device History RPC Functions

  This migration creates database functions for querying, filtering, and exporting device history data.

  ## Functions Created

  1. **add_device_history_event** - Helper function for consistent event logging
  2. **get_device_history** - Query device history with filters
  3. **get_device_sessions** - Query device wake sessions with filters
  4. **get_site_history_with_devices** - Unified site audit trail including devices
  5. **get_program_history_with_devices** - Unified program audit trail including devices
  6. **export_device_history_csv** - Export device history as CSV
  7. **export_device_sessions_csv** - Export device sessions as CSV
*/

-- ============================================
-- FUNCTION 1: Add Device History Event
-- ============================================

CREATE OR REPLACE FUNCTION add_device_history_event(
  p_device_id UUID,
  p_event_category device_event_category,
  p_event_type TEXT,
  p_severity event_severity DEFAULT 'info',
  p_description TEXT DEFAULT NULL,
  p_event_data JSONB DEFAULT '{}'::jsonb,
  p_session_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_history_id UUID;
  v_site_id UUID;
  v_program_id UUID;
  v_device_metadata JSONB;
BEGIN
  -- Get current device assignments
  SELECT site_id, program_id INTO v_site_id, v_program_id
  FROM devices
  WHERE device_id = p_device_id;

  -- Build device metadata snapshot
  SELECT jsonb_build_object(
    'device_mac', device_mac,
    'device_code', device_code,
    'device_name', device_name,
    'firmware_version', firmware_version,
    'hardware_version', hardware_version,
    'provisioning_status', provisioning_status,
    'is_active', is_active,
    'battery_health_percent', battery_health_percent,
    'battery_voltage', battery_voltage
  ) INTO v_device_metadata
  FROM devices
  WHERE device_id = p_device_id;

  -- Insert history event
  INSERT INTO device_history (
    device_id,
    site_id,
    program_id,
    session_id,
    event_category,
    event_type,
    severity,
    description,
    event_data,
    metadata,
    user_id
  ) VALUES (
    p_device_id,
    v_site_id,
    v_program_id,
    p_session_id,
    p_event_category,
    p_event_type,
    p_severity,
    p_description,
    p_event_data,
    v_device_metadata,
    p_user_id
  ) RETURNING history_id INTO v_history_id;

  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION 2: Get Device History
-- ============================================

CREATE OR REPLACE FUNCTION get_device_history(
  p_device_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_program_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_categories device_event_category[] DEFAULT NULL,
  p_severity_levels event_severity[] DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_has_errors BOOLEAN DEFAULT NULL,
  p_search_text TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 25,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  history_id UUID,
  device_id UUID,
  device_mac TEXT,
  device_name TEXT,
  site_id UUID,
  site_name TEXT,
  program_id UUID,
  program_name TEXT,
  session_id UUID,
  event_category device_event_category,
  event_type TEXT,
  severity event_severity,
  event_timestamp TIMESTAMPTZ,
  description TEXT,
  event_data JSONB,
  metadata JSONB,
  user_id UUID,
  user_email TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dh.history_id,
    dh.device_id,
    d.device_mac,
    d.device_name,
    dh.site_id,
    s.name AS site_name,
    dh.program_id,
    pp.name AS program_name,
    dh.session_id,
    dh.event_category,
    dh.event_type,
    dh.severity,
    dh.event_timestamp,
    dh.description,
    dh.event_data,
    dh.metadata,
    dh.user_id,
    u.email AS user_email,
    dh.created_at
  FROM device_history dh
  LEFT JOIN devices d ON dh.device_id = d.device_id
  LEFT JOIN sites s ON dh.site_id = s.site_id
  LEFT JOIN pilot_programs pp ON dh.program_id = pp.program_id
  LEFT JOIN users u ON dh.user_id = u.id
  WHERE
    (p_device_id IS NULL OR dh.device_id = p_device_id)
    AND (p_site_id IS NULL OR dh.site_id = p_site_id)
    AND (p_program_id IS NULL OR dh.program_id = p_program_id)
    AND (p_start_date IS NULL OR dh.event_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR dh.event_timestamp <= p_end_date)
    AND (p_categories IS NULL OR dh.event_category = ANY(p_categories))
    AND (p_severity_levels IS NULL OR dh.severity = ANY(p_severity_levels))
    AND (p_user_id IS NULL OR dh.user_id = p_user_id)
    AND (p_has_errors IS NULL OR (p_has_errors = true AND dh.severity IN ('error', 'critical')))
    AND (p_search_text IS NULL OR dh.description ILIKE '%' || p_search_text || '%' OR dh.event_type ILIKE '%' || p_search_text || '%')
  ORDER BY dh.event_timestamp DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION 3: Get Device Sessions
-- ============================================

CREATE OR REPLACE FUNCTION get_device_sessions(
  p_device_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_program_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_status device_session_status[] DEFAULT NULL,
  p_with_errors BOOLEAN DEFAULT NULL,
  p_success_only BOOLEAN DEFAULT NULL,
  p_limit INTEGER DEFAULT 25,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  session_id UUID,
  device_id UUID,
  device_mac TEXT,
  device_name TEXT,
  site_id UUID,
  site_name TEXT,
  program_id UUID,
  program_name TEXT,
  wake_timestamp TIMESTAMPTZ,
  session_duration_ms INTEGER,
  next_wake_scheduled TIMESTAMPTZ,
  connection_success BOOLEAN,
  image_captured BOOLEAN,
  image_id UUID,
  chunks_sent INTEGER,
  chunks_total INTEGER,
  transmission_complete BOOLEAN,
  telemetry_data JSONB,
  status device_session_status,
  error_codes TEXT[],
  pending_images_count INTEGER,
  was_offline_capture BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dws.session_id,
    dws.device_id,
    d.device_mac,
    d.device_name,
    dws.site_id,
    s.name AS site_name,
    dws.program_id,
    pp.name AS program_name,
    dws.wake_timestamp,
    dws.session_duration_ms,
    dws.next_wake_scheduled,
    dws.connection_success,
    dws.image_captured,
    dws.image_id,
    dws.chunks_sent,
    dws.chunks_total,
    dws.transmission_complete,
    dws.telemetry_data,
    dws.status,
    dws.error_codes,
    dws.pending_images_count,
    dws.was_offline_capture,
    dws.created_at,
    dws.updated_at
  FROM device_wake_sessions dws
  LEFT JOIN devices d ON dws.device_id = d.device_id
  LEFT JOIN sites s ON dws.site_id = s.site_id
  LEFT JOIN pilot_programs pp ON dws.program_id = pp.program_id
  WHERE
    (p_device_id IS NULL OR dws.device_id = p_device_id)
    AND (p_site_id IS NULL OR dws.site_id = p_site_id)
    AND (p_program_id IS NULL OR dws.program_id = p_program_id)
    AND (p_start_date IS NULL OR dws.wake_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR dws.wake_timestamp <= p_end_date)
    AND (p_status IS NULL OR dws.status = ANY(p_status))
    AND (p_with_errors IS NULL OR (p_with_errors = true AND array_length(dws.error_codes, 1) > 0))
    AND (p_success_only IS NULL OR (p_success_only = true AND dws.status = 'success'))
  ORDER BY dws.wake_timestamp DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION 4: Get Site History with Devices
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
  device_id UUID,
  device_name TEXT,
  user_email TEXT,
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
    dh.device_id,
    d.device_name,
    u.email AS user_email,
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
    NULL::UUID AS device_id,
    NULL AS device_name,
    u.email AS user_email,
    jsonb_build_object('old_data', pph.old_data, 'new_data', pph.new_data) AS event_data
  FROM pilot_program_history_staging pph
  LEFT JOIN users u ON pph.user_id = u.id
  WHERE
    pph.object_type = 'site'
    AND pph.object_id::UUID = p_site_id
    AND (p_start_date IS NULL OR pph.event_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR pph.event_timestamp <= p_end_date)
    AND (p_event_types IS NULL OR pph.update_type = ANY(p_event_types))

  ORDER BY event_timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION 5: Get Program History with Devices
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
  site_id UUID,
  site_name TEXT,
  device_id UUID,
  device_name TEXT,
  user_email TEXT,
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
    dh.site_id,
    s.name AS site_name,
    dh.device_id,
    d.device_name,
    u.email AS user_email,
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
    'program' AS event_source,
    pph.update_type AS event_type,
    'program_activity' AS event_category,
    'info' AS severity,
    pph.event_timestamp,
    pph.update_type AS description,
    CASE WHEN pph.object_type = 'site' THEN pph.object_id::UUID ELSE NULL END AS site_id,
    s.name AS site_name,
    NULL::UUID AS device_id,
    NULL AS device_name,
    u.email AS user_email,
    jsonb_build_object('old_data', pph.old_data, 'new_data', pph.new_data) AS event_data
  FROM pilot_program_history_staging pph
  LEFT JOIN users u ON pph.user_id = u.id
  LEFT JOIN sites s ON (pph.object_type = 'site' AND pph.object_id::UUID = s.site_id)
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
-- FUNCTION 6: Export Device History CSV
-- ============================================

CREATE OR REPLACE FUNCTION export_device_history_csv(
  p_device_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_program_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_categories device_event_category[] DEFAULT NULL,
  p_severity_levels event_severity[] DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_csv TEXT;
  v_row RECORD;
BEGIN
  -- CSV Header
  v_csv := 'Timestamp,Event Category,Event Type,Severity,Device,Site,Program,User,Description,Temperature,Humidity,Battery %,Session ID,Error Code' || E'\n';

  -- Build CSV rows
  FOR v_row IN
    SELECT
      TO_CHAR(dh.event_timestamp, 'YYYY-MM-DD HH24:MI:SS TZ') AS timestamp,
      dh.event_category::TEXT,
      dh.event_type,
      dh.severity::TEXT,
      COALESCE(d.device_name, d.device_mac) AS device,
      s.name AS site,
      pp.name AS program,
      u.email AS user_email,
      dh.description,
      (dh.event_data->>'temperature')::TEXT AS temperature,
      (dh.event_data->>'humidity')::TEXT AS humidity,
      (dh.event_data->>'battery_health_percent')::TEXT AS battery_percent,
      dh.session_id::TEXT,
      (dh.event_data->>'error_code')::TEXT AS error_code
    FROM device_history dh
    LEFT JOIN devices d ON dh.device_id = d.device_id
    LEFT JOIN sites s ON dh.site_id = s.site_id
    LEFT JOIN pilot_programs pp ON dh.program_id = pp.program_id
    LEFT JOIN users u ON dh.user_id = u.id
    WHERE
      (p_device_id IS NULL OR dh.device_id = p_device_id)
      AND (p_site_id IS NULL OR dh.site_id = p_site_id)
      AND (p_program_id IS NULL OR dh.program_id = p_program_id)
      AND (p_start_date IS NULL OR dh.event_timestamp >= p_start_date)
      AND (p_end_date IS NULL OR dh.event_timestamp <= p_end_date)
      AND (p_categories IS NULL OR dh.event_category = ANY(p_categories))
      AND (p_severity_levels IS NULL OR dh.severity = ANY(p_severity_levels))
    ORDER BY dh.event_timestamp DESC
  LOOP
    v_csv := v_csv ||
      '"' || REPLACE(v_row.timestamp, '"', '""') || '",' ||
      '"' || REPLACE(v_row.event_category, '"', '""') || '",' ||
      '"' || REPLACE(v_row.event_type, '"', '""') || '",' ||
      '"' || REPLACE(v_row.severity, '"', '""') || '",' ||
      '"' || COALESCE(REPLACE(v_row.device, '"', '""'), '') || '",' ||
      '"' || COALESCE(REPLACE(v_row.site, '"', '""'), '') || '",' ||
      '"' || COALESCE(REPLACE(v_row.program, '"', '""'), '') || '",' ||
      '"' || COALESCE(REPLACE(v_row.user_email, '"', '""'), '') || '",' ||
      '"' || COALESCE(REPLACE(v_row.description, '"', '""'), '') || '",' ||
      COALESCE(v_row.temperature, '') || ',' ||
      COALESCE(v_row.humidity, '') || ',' ||
      COALESCE(v_row.battery_percent, '') || ',' ||
      COALESCE(v_row.session_id, '') || ',' ||
      COALESCE(v_row.error_code, '') ||
      E'\n';
  END LOOP;

  RETURN v_csv;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION 7: Export Device Sessions CSV
-- ============================================

CREATE OR REPLACE FUNCTION export_device_sessions_csv(
  p_device_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_program_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_csv TEXT;
  v_row RECORD;
BEGIN
  -- CSV Header
  v_csv := 'Timestamp,Device,Site,Program,Status,Image Captured,Chunks Sent,Chunks Total,Temperature,Humidity,Battery %,RSSI,Duration (ms),Errors,Pending Images' || E'\n';

  -- Build CSV rows
  FOR v_row IN
    SELECT
      TO_CHAR(dws.wake_timestamp, 'YYYY-MM-DD HH24:MI:SS TZ') AS timestamp,
      COALESCE(d.device_name, d.device_mac) AS device,
      s.name AS site,
      pp.name AS program,
      dws.status::TEXT,
      dws.image_captured::TEXT,
      dws.chunks_sent,
      dws.chunks_total,
      (dws.telemetry_data->>'temperature')::TEXT AS temperature,
      (dws.telemetry_data->>'humidity')::TEXT AS humidity,
      (dws.telemetry_data->>'battery_health_percent')::TEXT AS battery_percent,
      (dws.telemetry_data->>'wifi_rssi')::TEXT AS rssi,
      dws.session_duration_ms,
      array_to_string(dws.error_codes, ';') AS errors,
      dws.pending_images_count
    FROM device_wake_sessions dws
    LEFT JOIN devices d ON dws.device_id = d.device_id
    LEFT JOIN sites s ON dws.site_id = s.site_id
    LEFT JOIN pilot_programs pp ON dws.program_id = pp.program_id
    WHERE
      (p_device_id IS NULL OR dws.device_id = p_device_id)
      AND (p_site_id IS NULL OR dws.site_id = p_site_id)
      AND (p_program_id IS NULL OR dws.program_id = p_program_id)
      AND (p_start_date IS NULL OR dws.wake_timestamp >= p_start_date)
      AND (p_end_date IS NULL OR dws.wake_timestamp <= p_end_date)
    ORDER BY dws.wake_timestamp DESC
  LOOP
    v_csv := v_csv ||
      '"' || REPLACE(v_row.timestamp, '"', '""') || '",' ||
      '"' || COALESCE(REPLACE(v_row.device, '"', '""'), '') || '",' ||
      '"' || COALESCE(REPLACE(v_row.site, '"', '""'), '') || '",' ||
      '"' || COALESCE(REPLACE(v_row.program, '"', '""'), '') || '",' ||
      '"' || REPLACE(v_row.status, '"', '""') || '",' ||
      v_row.image_captured || ',' ||
      v_row.chunks_sent || ',' ||
      v_row.chunks_total || ',' ||
      COALESCE(v_row.temperature, '') || ',' ||
      COALESCE(v_row.humidity, '') || ',' ||
      COALESCE(v_row.battery_percent, '') || ',' ||
      COALESCE(v_row.rssi, '') || ',' ||
      COALESCE(v_row.session_duration_ms::TEXT, '') || ',' ||
      '"' || COALESCE(v_row.errors, '') || '",' ||
      COALESCE(v_row.pending_images_count::TEXT, '') ||
      E'\n';
  END LOOP;

  RETURN v_csv;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Grant Permissions
-- ============================================

GRANT EXECUTE ON FUNCTION add_device_history_event TO authenticated;
GRANT EXECUTE ON FUNCTION get_device_history TO authenticated;
GRANT EXECUTE ON FUNCTION get_device_sessions TO authenticated;
GRANT EXECUTE ON FUNCTION get_site_history_with_devices TO authenticated;
GRANT EXECUTE ON FUNCTION get_program_history_with_devices TO authenticated;
GRANT EXECUTE ON FUNCTION export_device_history_csv TO authenticated;
GRANT EXECUTE ON FUNCTION export_device_sessions_csv TO authenticated;
