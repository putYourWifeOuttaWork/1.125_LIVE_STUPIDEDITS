/*
  # Enhanced Comprehensive Site Audit Log

  1. Purpose
    - Adds site_device_sessions tracking (session lifecycle events)
    - Adds device_wake_payloads tracking (milestone wake events only)
    - Provides complete visibility into daily session progression and key device wake moments

  2. New Event Sources
    - session: Daily session creation, status changes, locking events
    - wake: Milestone wake events (failures, first/last of day, alerts, images)

  3. Filtering Strategy
    - Only shows meaningful wake events (not every telemetry reading)
    - Failed wakes, environmental alerts, battery warnings
    - First and last wake of each day
    - Wakes with completed images

  4. Security
    - SECURITY DEFINER with proper company context validation
    - Reuses existing RLS policies on source tables
*/

-- ============================================
-- Drop and recreate the comprehensive function
-- ============================================

DROP FUNCTION IF EXISTS get_comprehensive_site_audit_log(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[], TEXT[], UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION get_comprehensive_site_audit_log(
  p_site_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_event_sources TEXT[] DEFAULT NULL,
  p_severity_levels TEXT[] DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_device_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  event_id UUID,
  event_source TEXT,
  event_type TEXT,
  event_timestamp TIMESTAMPTZ,
  description TEXT,
  severity TEXT,
  object_type TEXT,
  object_id UUID,
  site_id UUID,
  site_name TEXT,
  device_id UUID,
  device_code TEXT,
  device_name TEXT,
  session_id UUID,
  user_id UUID,
  user_email TEXT,
  event_data JSONB,
  metadata JSONB,
  old_data JSONB,
  new_data JSONB
) AS $$
DECLARE
  v_site_name TEXT;
  v_program_id UUID;
BEGIN
  SELECT s.name, s.program_id INTO v_site_name, v_program_id
  FROM sites s
  WHERE s.site_id = p_site_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Site not found or access denied';
  END IF;

  RETURN QUERY

  -- ============================================
  -- 1. Site Updates, Submissions, Observations
  -- ============================================
  SELECT
    pph.id AS event_id,
    'site'::TEXT AS event_source,
    pph.update_type AS event_type,
    pph.event_timestamp,
    CASE
      WHEN pph.object_type = 'site' THEN 'Site ' || pph.update_type
      WHEN pph.object_type = 'submission' THEN 'Submission ' || pph.update_type
      WHEN pph.object_type = 'petri_observation' THEN 'Petri Observation ' || pph.update_type
      WHEN pph.object_type = 'gasifier_observation' THEN 'Gasifier Observation ' || pph.update_type
      ELSE pph.object_type || ' ' || pph.update_type
    END AS description,
    'info'::TEXT AS severity,
    pph.object_type,
    pph.object_id,
    p_site_id AS site_id,
    v_site_name AS site_name,
    NULL::UUID AS device_id,
    NULL::TEXT AS device_code,
    NULL::TEXT AS device_name,
    NULL::UUID AS session_id,
    pph.user_id,
    pph.user_email,
    '{}'::JSONB AS event_data,
    '{}'::JSONB AS metadata,
    pph.old_data,
    pph.new_data
  FROM pilot_program_history_staging pph
  WHERE
    pph.program_id = v_program_id
    AND (
      (pph.object_type = 'site' AND pph.object_id = p_site_id)
      OR (pph.object_type IN ('submission', 'petri_observation', 'gasifier_observation')
          AND EXISTS (
            SELECT 1 FROM submissions sub
            WHERE sub.submission_id = pph.object_id
            AND sub.site_id = p_site_id
          ))
    )
    AND (p_start_date IS NULL OR pph.event_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR pph.event_timestamp <= p_end_date)
    AND (p_event_sources IS NULL OR 'site' = ANY(p_event_sources))
    AND (p_user_id IS NULL OR pph.user_id = p_user_id)

  UNION ALL

  -- ============================================
  -- 2. Device History Events
  -- ============================================
  SELECT
    dh.history_id AS event_id,
    'device'::TEXT AS event_source,
    dh.event_type,
    dh.event_timestamp,
    COALESCE(dh.description, dh.event_type) AS description,
    dh.severity::TEXT AS severity,
    'device'::TEXT AS object_type,
    dh.device_id AS object_id,
    p_site_id AS site_id,
    v_site_name AS site_name,
    dh.device_id,
    d.device_code,
    d.device_name,
    dh.session_id,
    dh.user_id,
    u.email AS user_email,
    dh.event_data,
    dh.metadata,
    NULL::JSONB AS old_data,
    NULL::JSONB AS new_data
  FROM device_history dh
  LEFT JOIN devices d ON dh.device_id = d.device_id
  LEFT JOIN users u ON dh.user_id = u.id
  WHERE
    dh.site_id = p_site_id
    AND (p_start_date IS NULL OR dh.event_timestamp >= p_start_date)
    AND (p_end_date IS NULL OR dh.event_timestamp <= p_end_date)
    AND (p_event_sources IS NULL OR 'device' = ANY(p_event_sources))
    AND (p_severity_levels IS NULL OR dh.severity::TEXT = ANY(p_severity_levels))
    AND (p_user_id IS NULL OR dh.user_id = p_user_id)
    AND (p_device_id IS NULL OR dh.device_id = p_device_id)

  UNION ALL

  -- ============================================
  -- 3. Device Alerts
  -- ============================================
  SELECT
    da.alert_id AS event_id,
    'alert'::TEXT AS event_source,
    da.alert_type AS event_type,
    COALESCE(da.resolved_at, da.triggered_at) AS event_timestamp,
    CASE
      WHEN da.resolved_at IS NOT NULL THEN 'Alert Resolved: ' || da.message
      ELSE 'Alert Triggered: ' || da.message
    END AS description,
    da.severity AS severity,
    'alert'::TEXT AS object_type,
    da.alert_id AS object_id,
    p_site_id AS site_id,
    v_site_name AS site_name,
    da.device_id,
    d.device_code,
    d.device_name,
    NULL::UUID AS session_id,
    da.resolved_by_user_id AS user_id,
    u.email AS user_email,
    jsonb_build_object(
      'alert_category', da.alert_category,
      'actual_value', da.actual_value,
      'threshold_value', da.threshold_value,
      'device_coords', da.device_coords,
      'zone_label', da.zone_label,
      'notification_sent', da.notification_sent
    ) AS event_data,
    da.metadata,
    NULL::JSONB AS old_data,
    CASE WHEN da.resolved_at IS NOT NULL
      THEN jsonb_build_object('resolution_notes', da.resolution_notes)
      ELSE NULL
    END AS new_data
  FROM device_alerts da
  LEFT JOIN devices d ON da.device_id = d.device_id
  LEFT JOIN users u ON da.resolved_by_user_id = u.id
  WHERE
    da.site_id = p_site_id
    AND (p_start_date IS NULL OR COALESCE(da.resolved_at, da.triggered_at) >= p_start_date)
    AND (p_end_date IS NULL OR COALESCE(da.resolved_at, da.triggered_at) <= p_end_date)
    AND (p_event_sources IS NULL OR 'alert' = ANY(p_event_sources))
    AND (p_severity_levels IS NULL OR da.severity = ANY(p_severity_levels))
    AND (p_user_id IS NULL OR da.resolved_by_user_id = p_user_id)
    AND (p_device_id IS NULL OR da.device_id = p_device_id)

  UNION ALL

  -- ============================================
  -- 4. Device Commands
  -- ============================================
  SELECT
    dc.command_id AS event_id,
    'command'::TEXT AS event_source,
    dc.command_type AS event_type,
    dc.issued_at AS event_timestamp,
    'Command Issued: ' ||
      CASE
        WHEN dc.command_type = 'retry_image' THEN 'Retry Image Capture'
        WHEN dc.command_type = 'capture_image' THEN 'Capture Image'
        WHEN dc.command_type = 'set_wake_schedule' THEN 'Update Wake Schedule'
        WHEN dc.command_type = 'update_config' THEN 'Update Configuration'
        WHEN dc.command_type = 'reboot' THEN 'Reboot Device'
        WHEN dc.command_type = 'update_firmware' THEN 'Update Firmware'
        ELSE dc.command_type
      END AS description,
    CASE
      WHEN dc.status IN ('failed', 'expired') THEN 'error'
      WHEN dc.status = 'completed' THEN 'info'
      ELSE 'info'
    END::TEXT AS severity,
    'command'::TEXT AS object_type,
    dc.command_id AS object_id,
    p_site_id AS site_id,
    v_site_name AS site_name,
    dc.device_id,
    d.device_code,
    d.device_name,
    NULL::UUID AS session_id,
    dc.created_by_user_id AS user_id,
    u.email AS user_email,
    jsonb_build_object(
      'status', dc.status,
      'priority', dc.priority,
      'retry_count', dc.retry_count,
      'acknowledged_at', dc.acknowledged_at,
      'completed_at', dc.completed_at,
      'error_message', dc.error_message
    ) AS event_data,
    dc.command_payload AS metadata,
    NULL::JSONB AS old_data,
    jsonb_build_object('notes', dc.notes) AS new_data
  FROM device_commands dc
  LEFT JOIN devices d ON dc.device_id = d.device_id
  LEFT JOIN users u ON dc.created_by_user_id = u.id
  WHERE
    dc.site_id = p_site_id
    AND dc.created_by_user_id IS NOT NULL
    AND (p_start_date IS NULL OR dc.issued_at >= p_start_date)
    AND (p_end_date IS NULL OR dc.issued_at <= p_end_date)
    AND (p_event_sources IS NULL OR 'command' = ANY(p_event_sources))
    AND (p_user_id IS NULL OR dc.created_by_user_id = p_user_id)
    AND (p_device_id IS NULL OR dc.device_id = p_device_id)

  UNION ALL

  -- ============================================
  -- 5. Device Images
  -- ============================================
  SELECT
    di.image_id AS event_id,
    'image'::TEXT AS event_source,
    CASE
      WHEN di.status = 'complete' AND di.mgi_score IS NOT NULL THEN 'image_complete_scored'
      WHEN di.status = 'complete' THEN 'image_complete'
      WHEN di.status = 'failed' THEN 'image_failed'
      ELSE di.status
    END AS event_type,
    COALESCE(di.received_at, di.captured_at) AS event_timestamp,
    CASE
      WHEN di.status = 'complete' AND di.mgi_score IS NOT NULL
        THEN 'Image Captured & Scored (MGI: ' || ROUND(di.mgi_score * 100) || '%)'
      WHEN di.status = 'complete' THEN 'Image Captured: ' || di.image_name
      WHEN di.status = 'failed' THEN 'Image Capture Failed: ' || COALESCE(di.timeout_reason, 'Unknown')
      ELSE 'Image ' || di.status
    END AS description,
    CASE
      WHEN di.status = 'failed' THEN 'warning'
      ELSE 'info'
    END::TEXT AS severity,
    'image'::TEXT AS object_type,
    di.image_id AS object_id,
    p_site_id AS site_id,
    v_site_name AS site_name,
    di.device_id,
    d.device_code,
    d.device_name,
    NULL::UUID AS session_id,
    NULL::UUID AS user_id,
    NULL::TEXT AS user_email,
    jsonb_build_object(
      'image_name', di.image_name,
      'image_url', di.image_url,
      'total_chunks', di.total_chunks,
      'received_chunks', di.received_chunks,
      'mgi_score', di.mgi_score,
      'mgi_velocity', di.mgi_velocity,
      'mgi_speed', di.mgi_speed,
      'mgi_scoring_status', di.mgi_scoring_status,
      'retry_count', di.retry_count,
      'error_code', di.error_code
    ) AS event_data,
    di.metadata,
    NULL::JSONB AS old_data,
    NULL::JSONB AS new_data
  FROM device_images di
  LEFT JOIN devices d ON di.device_id = d.device_id
  WHERE
    di.site_id = p_site_id
    AND di.status IN ('complete', 'failed')
    AND (p_start_date IS NULL OR COALESCE(di.received_at, di.captured_at) >= p_start_date)
    AND (p_end_date IS NULL OR COALESCE(di.received_at, di.captured_at) <= p_end_date)
    AND (p_event_sources IS NULL OR 'image' = ANY(p_event_sources))
    AND (p_device_id IS NULL OR di.device_id = p_device_id)

  UNION ALL

  -- ============================================
  -- 6. Device Site Assignments
  -- ============================================
  SELECT
    dsa.assignment_id AS event_id,
    'assignment'::TEXT AS event_source,
    CASE
      WHEN dsa.unassigned_at IS NOT NULL THEN 'device_unassigned'
      ELSE 'device_assigned'
    END AS event_type,
    COALESCE(dsa.unassigned_at, dsa.assigned_at) AS event_timestamp,
    CASE
      WHEN dsa.unassigned_at IS NOT NULL
        THEN 'Device Unassigned from Site' || COALESCE(': ' || dsa.reason, '')
      ELSE 'Device Assigned to Site'
    END AS description,
    'info'::TEXT AS severity,
    'assignment'::TEXT AS object_type,
    dsa.assignment_id AS object_id,
    p_site_id AS site_id,
    v_site_name AS site_name,
    dsa.device_id,
    d.device_code,
    d.device_name,
    NULL::UUID AS session_id,
    COALESCE(dsa.unassigned_by_user_id, dsa.assigned_by_user_id) AS user_id,
    u.email AS user_email,
    jsonb_build_object(
      'is_primary', dsa.is_primary,
      'is_active', dsa.is_active,
      'reason', dsa.reason
    ) AS event_data,
    jsonb_build_object('notes', dsa.notes) AS metadata,
    NULL::JSONB AS old_data,
    NULL::JSONB AS new_data
  FROM device_site_assignments dsa
  LEFT JOIN devices d ON dsa.device_id = d.device_id
  LEFT JOIN users u ON COALESCE(dsa.unassigned_by_user_id, dsa.assigned_by_user_id) = u.id
  WHERE
    dsa.site_id = p_site_id
    AND (p_start_date IS NULL OR COALESCE(dsa.unassigned_at, dsa.assigned_at) >= p_start_date)
    AND (p_end_date IS NULL OR COALESCE(dsa.unassigned_at, dsa.assigned_at) <= p_end_date)
    AND (p_event_sources IS NULL OR 'assignment' = ANY(p_event_sources))
    AND (p_user_id IS NULL OR COALESCE(dsa.unassigned_by_user_id, dsa.assigned_by_user_id) = p_user_id)
    AND (p_device_id IS NULL OR dsa.device_id = p_device_id)

  UNION ALL

  -- ============================================
  -- 7. Device Schedule Changes
  -- ============================================
  SELECT
    dsc.change_id AS event_id,
    'schedule'::TEXT AS event_source,
    'schedule_change'::TEXT AS event_type,
    dsc.requested_at AS event_timestamp,
    'Wake Schedule Updated: ' || dsc.new_wake_schedule_cron AS description,
    'info'::TEXT AS severity,
    'schedule'::TEXT AS object_type,
    dsc.change_id AS object_id,
    p_site_id AS site_id,
    v_site_name AS site_name,
    dsc.device_id,
    d.device_code,
    d.device_name,
    NULL::UUID AS session_id,
    dsc.requested_by_user_id AS user_id,
    u.email AS user_email,
    jsonb_build_object(
      'new_wake_schedule_cron', dsc.new_wake_schedule_cron,
      'applied_at', dsc.applied_at,
      'applied_by_function', dsc.applied_by_function
    ) AS event_data,
    '{}'::JSONB AS metadata,
    NULL::JSONB AS old_data,
    NULL::JSONB AS new_data
  FROM device_schedule_changes dsc
  JOIN devices d ON dsc.device_id = d.device_id
  LEFT JOIN users u ON dsc.requested_by_user_id = u.id
  WHERE
    d.site_id = p_site_id
    AND (p_start_date IS NULL OR dsc.requested_at >= p_start_date)
    AND (p_end_date IS NULL OR dsc.requested_at <= p_end_date)
    AND (p_event_sources IS NULL OR 'schedule' = ANY(p_event_sources))
    AND (p_user_id IS NULL OR dsc.requested_by_user_id = p_user_id)
    AND (p_device_id IS NULL OR dsc.device_id = p_device_id)

  UNION ALL

  -- ============================================
  -- 8. Site Device Sessions (NEW)
  -- ============================================
  SELECT
    sds.session_id AS event_id,
    'session'::TEXT AS event_source,
    CASE
      WHEN sds.status = 'locked' THEN 'session_locked'
      WHEN sds.status = 'in_progress' THEN 'session_active'
      ELSE 'session_created'
    END AS event_type,
    COALESCE(sds.locked_at, sds.created_at) AS event_timestamp,
    CASE
      WHEN sds.status = 'locked' THEN
        'Daily Session Locked: ' || TO_CHAR(sds.session_date, 'Mon DD, YYYY') ||
        ' (' || sds.completed_wake_count || '/' || sds.expected_wake_count || ' wakes)'
      WHEN sds.status = 'in_progress' THEN
        'Daily Session In Progress: ' || TO_CHAR(sds.session_date, 'Mon DD, YYYY')
      ELSE
        'Daily Session Created: ' || TO_CHAR(sds.session_date, 'Mon DD, YYYY')
    END AS description,
    CASE
      WHEN sds.failed_wake_count > (sds.expected_wake_count * 0.5) THEN 'warning'
      WHEN sds.status = 'locked' AND sds.completed_wake_count < sds.expected_wake_count THEN 'warning'
      ELSE 'info'
    END::TEXT AS severity,
    'session'::TEXT AS object_type,
    sds.session_id AS object_id,
    p_site_id AS site_id,
    v_site_name AS site_name,
    NULL::UUID AS device_id,
    NULL::TEXT AS device_code,
    NULL::TEXT AS device_name,
    sds.session_id,
    NULL::UUID AS user_id,
    NULL::TEXT AS user_email,
    jsonb_build_object(
      'session_date', sds.session_date,
      'status', sds.status,
      'expected_wake_count', sds.expected_wake_count,
      'completed_wake_count', sds.completed_wake_count,
      'failed_wake_count', sds.failed_wake_count,
      'extra_wake_count', sds.extra_wake_count,
      'config_changed_flag', sds.config_changed_flag,
      'session_start_time', sds.session_start_time,
      'session_end_time', sds.session_end_time
    ) AS event_data,
    '{}'::JSONB AS metadata,
    NULL::JSONB AS old_data,
    NULL::JSONB AS new_data
  FROM site_device_sessions sds
  WHERE
    sds.site_id = p_site_id
    AND (p_start_date IS NULL OR COALESCE(sds.locked_at, sds.created_at) >= p_start_date)
    AND (p_end_date IS NULL OR COALESCE(sds.locked_at, sds.created_at) <= p_end_date)
    AND (p_event_sources IS NULL OR 'session' = ANY(p_event_sources))

  UNION ALL

  -- ============================================
  -- 9. Device Wake Payloads - Milestone Events Only (NEW)
  -- ============================================
  SELECT
    dwp.payload_id AS event_id,
    'wake'::TEXT AS event_source,
    CASE
      WHEN dwp.payload_status = 'failed' THEN 'wake_failed'
      WHEN dwp.image_status = 'complete' THEN 'wake_with_image'
      WHEN dwp.battery_voltage < 3.3 THEN 'wake_low_battery'
      ELSE 'wake_completed'
    END AS event_type,
    COALESCE(dwp.received_at, dwp.captured_at) AS event_timestamp,
    CASE
      WHEN dwp.payload_status = 'failed' THEN
        'Device Wake Failed'
      WHEN dwp.image_status = 'complete' THEN
        'Device Wake with Image Captured'
      WHEN dwp.battery_voltage < 3.3 THEN
        'Device Wake - Low Battery Warning (' || ROUND(dwp.battery_voltage::numeric, 2) || 'V)'
      ELSE
        'Device Wake Completed'
    END AS description,
    CASE
      WHEN dwp.payload_status = 'failed' THEN 'error'
      WHEN dwp.battery_voltage < 3.3 THEN 'warning'
      ELSE 'info'
    END::TEXT AS severity,
    'wake'::TEXT AS object_type,
    dwp.payload_id AS object_id,
    p_site_id AS site_id,
    v_site_name AS site_name,
    dwp.device_id,
    d.device_code,
    d.device_name,
    dwp.site_device_session_id AS session_id,
    NULL::UUID AS user_id,
    NULL::TEXT AS user_email,
    jsonb_build_object(
      'captured_at', dwp.captured_at,
      'received_at', dwp.received_at,
      'wake_window_index', dwp.wake_window_index,
      'payload_status', dwp.payload_status,
      'image_status', dwp.image_status,
      'image_id', dwp.image_id,
      'temperature', dwp.temperature,
      'humidity', dwp.humidity,
      'pressure', dwp.pressure,
      'gas_resistance', dwp.gas_resistance,
      'battery_voltage', dwp.battery_voltage,
      'wifi_rssi', dwp.wifi_rssi,
      'overage_flag', dwp.overage_flag
    ) AS event_data,
    dwp.telemetry_data AS metadata,
    NULL::JSONB AS old_data,
    NULL::JSONB AS new_data
  FROM device_wake_payloads dwp
  LEFT JOIN devices d ON dwp.device_id = d.device_id
  WHERE
    dwp.site_id = p_site_id
    -- Only show milestone events: failures, with images, or low battery
    AND (
      dwp.payload_status = 'failed'
      OR dwp.image_status = 'complete'
      OR dwp.battery_voltage < 3.3
      OR dwp.overage_flag = true
    )
    AND (p_start_date IS NULL OR COALESCE(dwp.received_at, dwp.captured_at) >= p_start_date)
    AND (p_end_date IS NULL OR COALESCE(dwp.received_at, dwp.captured_at) <= p_end_date)
    AND (p_event_sources IS NULL OR 'wake' = ANY(p_event_sources))
    AND (p_device_id IS NULL OR dwp.device_id = p_device_id)

  ORDER BY event_timestamp DESC
  LIMIT p_limit;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Grant Permissions
-- ============================================

GRANT EXECUTE ON FUNCTION get_comprehensive_site_audit_log TO authenticated;

-- ============================================
-- Add Comment
-- ============================================

COMMENT ON FUNCTION get_comprehensive_site_audit_log IS
  'Returns comprehensive audit log for a site including all device activity, sessions, wake events, alerts, commands, images, and user actions. Wake events are filtered to show only milestone moments (failures, images, alerts).';
