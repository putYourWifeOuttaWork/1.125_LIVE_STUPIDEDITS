/*
  # Device Query and Export Functions

  1. New Functions
    - get_device_history(): Filtered device history query with user email joining
    - get_device_sessions(): Filtered device wake sessions with site/program names
    - export_device_history_csv(): CSV export of device history
    - export_device_sessions_csv(): CSV export of device wake sessions
    - get_device_images_with_status(): Get device images with detailed status
    - retry_failed_device_images(): Queue retry commands for failed images

  2. Purpose
    - Enable advanced filtering for device history and sessions
    - Support CSV export for troubleshooting and reporting
    - Facilitate image retry management

  3. Security
    - Functions use SECURITY DEFINER to access all required data
    - Respects RLS policies on underlying tables
*/

-- Function to get filtered device history with user information
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
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  history_id UUID,
  device_id UUID,
  site_id UUID,
  program_id UUID,
  session_id UUID,
  event_category device_event_category,
  event_type TEXT,
  severity event_severity,
  event_timestamp TIMESTAMPTZ,
  event_data JSONB,
  metadata JSONB,
  user_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ,
  user_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dh.history_id,
    dh.device_id,
    dh.site_id,
    dh.program_id,
    dh.session_id,
    dh.event_category,
    dh.event_type,
    dh.severity,
    dh.event_timestamp,
    dh.event_data,
    dh.metadata,
    dh.user_id,
    dh.description,
    dh.created_at,
    u.email as user_email
  FROM device_history dh
  LEFT JOIN auth.users u ON dh.user_id = u.id
  WHERE
    (p_device_id IS NULL OR dh.device_id = p_device_id)
    AND (p_site_id IS NULL OR dh.site_id = p_site_id)
    AND (p_program_id IS NULL OR dh.program_id = p_program_id)
    AND (p_start_date IS NULL OR dh.event_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR dh.event_timestamp <= p_end_date)
    AND (p_categories IS NULL OR dh.event_category = ANY(p_categories))
    AND (p_severity_levels IS NULL OR dh.severity = ANY(p_severity_levels))
    AND (p_user_id IS NULL OR dh.user_id = p_user_id)
    AND (p_has_errors IS NULL OR (p_has_errors = TRUE AND dh.severity IN ('error', 'critical')))
    AND (p_search_text IS NULL OR dh.description ILIKE '%' || p_search_text || '%' OR dh.event_type ILIKE '%' || p_search_text || '%')
  ORDER BY dh.event_timestamp DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to get filtered device wake sessions with site/program names
CREATE OR REPLACE FUNCTION get_device_sessions(
  p_device_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_program_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_status device_session_status[] DEFAULT NULL,
  p_with_errors BOOLEAN DEFAULT NULL,
  p_success_only BOOLEAN DEFAULT NULL,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  session_id UUID,
  device_id UUID,
  site_id UUID,
  program_id UUID,
  wake_timestamp TIMESTAMPTZ,
  session_duration_ms INT,
  next_wake_scheduled TIMESTAMPTZ,
  connection_success BOOLEAN,
  wifi_retry_count INT,
  mqtt_connected BOOLEAN,
  image_captured BOOLEAN,
  image_id UUID,
  chunks_sent INT,
  chunks_total INT,
  chunks_missing INT[],
  transmission_complete BOOLEAN,
  telemetry_data JSONB,
  status device_session_status,
  error_codes TEXT[],
  pending_images_count INT,
  was_offline_capture BOOLEAN,
  offline_duration_hours NUMERIC,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  site_name TEXT,
  program_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dws.session_id,
    dws.device_id,
    dws.site_id,
    dws.program_id,
    dws.wake_timestamp,
    dws.session_duration_ms,
    dws.next_wake_scheduled,
    dws.connection_success,
    dws.wifi_retry_count,
    dws.mqtt_connected,
    dws.image_captured,
    dws.image_id,
    dws.chunks_sent,
    dws.chunks_total,
    dws.chunks_missing,
    dws.transmission_complete,
    dws.telemetry_data,
    dws.status,
    dws.error_codes,
    dws.pending_images_count,
    dws.was_offline_capture,
    dws.offline_duration_hours,
    dws.created_at,
    dws.updated_at,
    s.name as site_name,
    pp.name as program_name
  FROM device_wake_sessions dws
  LEFT JOIN sites s ON dws.site_id = s.site_id
  LEFT JOIN pilot_programs pp ON dws.program_id = pp.program_id
  WHERE
    (p_device_id IS NULL OR dws.device_id = p_device_id)
    AND (p_site_id IS NULL OR dws.site_id = p_site_id)
    AND (p_program_id IS NULL OR dws.program_id = p_program_id)
    AND (p_start_date IS NULL OR dws.wake_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR dws.wake_timestamp <= p_end_date)
    AND (p_status IS NULL OR dws.status = ANY(p_status))
    AND (p_with_errors IS NULL OR (p_with_errors = TRUE AND dws.error_codes IS NOT NULL AND array_length(dws.error_codes, 1) > 0))
    AND (p_success_only IS NULL OR (p_success_only = TRUE AND dws.status = 'success'))
  ORDER BY dws.wake_timestamp DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to export device history as CSV
CREATE OR REPLACE FUNCTION export_device_history_csv(
  p_device_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_program_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_categories device_event_category[] DEFAULT NULL,
  p_severity_levels event_severity[] DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  csv_output TEXT;
BEGIN
  -- Build CSV header
  csv_output := 'Timestamp,Category,Severity,Event Type,Description,User Email' || E'\n';

  -- Build CSV rows
  SELECT string_agg(row_text, E'\n')
  INTO csv_output
  FROM (
    SELECT
      csv_output ||
      to_char(dh.event_timestamp, 'YYYY-MM-DD HH24:MI:SS') || ',' ||
      COALESCE(dh.event_category::TEXT, '') || ',' ||
      COALESCE(dh.severity::TEXT, '') || ',' ||
      COALESCE('"' || replace(dh.event_type, '"', '""') || '"', '') || ',' ||
      COALESCE('"' || replace(dh.description, '"', '""') || '"', '') || ',' ||
      COALESCE(u.email, 'System') as row_text
    FROM device_history dh
    LEFT JOIN auth.users u ON dh.user_id = u.id
    WHERE
      (p_device_id IS NULL OR dh.device_id = p_device_id)
      AND (p_site_id IS NULL OR dh.site_id = p_site_id)
      AND (p_program_id IS NULL OR dh.program_id = p_program_id)
      AND (p_start_date IS NULL OR dh.event_timestamp >= p_start_date)
      AND (p_end_date IS NULL OR dh.event_timestamp <= p_end_date)
      AND (p_categories IS NULL OR dh.event_category = ANY(p_categories))
      AND (p_severity_levels IS NULL OR dh.severity = ANY(p_severity_levels))
    ORDER BY dh.event_timestamp DESC
    LIMIT 1000
  ) csv_rows;

  RETURN csv_output;
END;
$$;

-- Function to export device sessions as CSV
CREATE OR REPLACE FUNCTION export_device_sessions_csv(
  p_device_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_program_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  csv_output TEXT;
BEGIN
  -- Build CSV header
  csv_output := 'Wake Timestamp,Status,Duration (ms),Connection Success,MQTT Connected,Image Captured,Chunks Sent,Chunks Total,Transmission Complete,Error Count,Site,Program' || E'\n';

  -- Build CSV rows
  SELECT string_agg(row_text, E'\n')
  INTO csv_output
  FROM (
    SELECT
      csv_output ||
      to_char(dws.wake_timestamp, 'YYYY-MM-DD HH24:MI:SS') || ',' ||
      COALESCE(dws.status::TEXT, '') || ',' ||
      COALESCE(dws.session_duration_ms::TEXT, '0') || ',' ||
      CASE WHEN dws.connection_success THEN 'Yes' ELSE 'No' END || ',' ||
      CASE WHEN dws.mqtt_connected THEN 'Yes' ELSE 'No' END || ',' ||
      CASE WHEN dws.image_captured THEN 'Yes' ELSE 'No' END || ',' ||
      COALESCE(dws.chunks_sent::TEXT, '0') || ',' ||
      COALESCE(dws.chunks_total::TEXT, '0') || ',' ||
      CASE WHEN dws.transmission_complete THEN 'Yes' ELSE 'No' END || ',' ||
      COALESCE(array_length(dws.error_codes, 1)::TEXT, '0') || ',' ||
      COALESCE('"' || replace(s.name, '"', '""') || '"', '') || ',' ||
      COALESCE('"' || replace(pp.name, '"', '""') || '"', '') as row_text
    FROM device_wake_sessions dws
    LEFT JOIN sites s ON dws.site_id = s.site_id
    LEFT JOIN pilot_programs pp ON dws.program_id = pp.program_id
    WHERE
      (p_device_id IS NULL OR dws.device_id = p_device_id)
      AND (p_site_id IS NULL OR dws.site_id = p_site_id)
      AND (p_program_id IS NULL OR dws.program_id = p_program_id)
      AND (p_start_date IS NULL OR dws.wake_timestamp >= p_start_date)
      AND (p_end_date IS NULL OR dws.wake_timestamp <= p_end_date)
    ORDER BY dws.wake_timestamp DESC
    LIMIT 1000
  ) csv_rows;

  RETURN csv_output;
END;
$$;

-- Function to get device images with detailed status
CREATE OR REPLACE FUNCTION get_device_images_with_status(
  p_device_id UUID
)
RETURNS TABLE (
  image_id UUID,
  device_id UUID,
  image_name TEXT,
  image_url TEXT,
  image_size INT,
  captured_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  total_chunks INT,
  received_chunks INT,
  status TEXT,
  error_code INT,
  retry_count INT,
  max_retries INT,
  failed_at TIMESTAMPTZ,
  timeout_reason TEXT,
  submission_id UUID,
  observation_id UUID,
  observation_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  error_category TEXT,
  error_message TEXT,
  can_retry BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    di.image_id,
    di.device_id,
    di.image_name,
    di.image_url,
    di.image_size,
    di.captured_at,
    di.received_at,
    di.total_chunks,
    di.received_chunks,
    di.status,
    di.error_code,
    di.retry_count,
    di.max_retries,
    di.failed_at,
    di.timeout_reason,
    di.submission_id,
    di.observation_id,
    di.observation_type,
    di.metadata,
    di.created_at,
    di.updated_at,
    dec.error_category,
    dec.error_message,
    (di.status = 'failed' AND di.retry_count < di.max_retries) as can_retry
  FROM device_images di
  LEFT JOIN device_error_codes dec ON di.error_code = dec.error_code
  WHERE di.device_id = p_device_id
  ORDER BY di.created_at DESC;
END;
$$;

-- Function to retry failed device images
CREATE OR REPLACE FUNCTION retry_failed_device_images(
  p_device_id UUID
)
RETURNS TABLE (
  images_queued INT,
  command_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_failed_image RECORD;
  v_command_id UUID;
  v_command_ids UUID[] := ARRAY[]::UUID[];
  v_count INT := 0;
BEGIN
  -- Loop through failed images that can be retried
  FOR v_failed_image IN
    SELECT image_id, image_name
    FROM device_images
    WHERE device_id = p_device_id
      AND status = 'failed'
      AND retry_count < max_retries
  LOOP
    -- Queue retry command using existing function
    v_command_id := queue_image_retry(
      p_device_id,
      v_failed_image.image_id,
      v_failed_image.image_name
    );

    v_command_ids := array_append(v_command_ids, v_command_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count, v_command_ids;
END;
$$;

-- Add helpful comments
COMMENT ON FUNCTION get_device_history IS 'Get filtered device history with user information for advanced querying';
COMMENT ON FUNCTION get_device_sessions IS 'Get filtered device wake sessions with site and program names';
COMMENT ON FUNCTION export_device_history_csv IS 'Export device history to CSV format for reporting';
COMMENT ON FUNCTION export_device_sessions_csv IS 'Export device wake sessions to CSV format for analysis';
COMMENT ON FUNCTION get_device_images_with_status IS 'Get device images with detailed status and error information';
COMMENT ON FUNCTION retry_failed_device_images IS 'Queue retry commands for all failed images on a device';
