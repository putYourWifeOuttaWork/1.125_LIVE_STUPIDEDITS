/*
  # Consolidate Device Events into device_history

  1. Schema Changes
    - Add source_table and source_id columns to device_history
    - Add triggered_by column to track event origin
    - Add indexes for better query performance

  2. Trigger Functions
    - device_schedule_changes → device_history
    - device_wake_sessions → device_history
    - device_alerts → device_history
    - device_commands → device_history
    - device_telemetry → device_history (summarized)

  3. Backfill
    - Migrate existing events from all tables

  4. Security
    - RLS policies already in place for device_history
*/

-- ============================================================================
-- 1. SCHEMA ENHANCEMENTS
-- ============================================================================

-- Add new columns to device_history if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_history' AND column_name = 'source_table'
  ) THEN
    ALTER TABLE device_history ADD COLUMN source_table text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_history' AND column_name = 'source_id'
  ) THEN
    ALTER TABLE device_history ADD COLUMN source_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_history' AND column_name = 'triggered_by'
  ) THEN
    ALTER TABLE device_history ADD COLUMN triggered_by text DEFAULT 'system';
  END IF;
END $$;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_device_history_source
  ON device_history(source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_device_history_event_timestamp_device
  ON device_history(device_id, event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_device_history_program_site
  ON device_history(program_id, site_id)
  WHERE program_id IS NOT NULL;

-- ============================================================================
-- 2. TRIGGER FUNCTIONS
-- ============================================================================

-- ============================================================================
-- A. Device Schedule Changes
-- ============================================================================
CREATE OR REPLACE FUNCTION log_device_schedule_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO device_history (
    device_id,
    company_id,
    event_category,
    event_type,
    severity,
    description,
    event_data,
    metadata,
    triggered_by,
    source_table,
    source_id,
    user_id,
    event_timestamp
  ) VALUES (
    NEW.device_id,
    NEW.company_id,
    'ConfigurationChange',
    'wake_schedule_updated',
    'info',
    format('Wake schedule changed to: %s (effective: %s)',
           NEW.new_wake_schedule_cron, NEW.effective_date),
    jsonb_build_object(
      'new_schedule', NEW.new_wake_schedule_cron,
      'effective_date', NEW.effective_date
    ),
    jsonb_build_object(
      'requested_at', NEW.requested_at,
      'applied_at', NEW.applied_at,
      'applied_by_function', NEW.applied_by_function
    ),
    'user',
    'device_schedule_changes',
    NEW.change_id,
    NEW.requested_by_user_id,
    COALESCE(NEW.applied_at, NEW.requested_at)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_schedule_change ON device_schedule_changes;
CREATE TRIGGER trigger_log_schedule_change
AFTER INSERT OR UPDATE ON device_schedule_changes
FOR EACH ROW
EXECUTE FUNCTION log_device_schedule_change();

-- ============================================================================
-- B. Device Wake Sessions
-- ============================================================================
CREATE OR REPLACE FUNCTION log_device_wake_session()
RETURNS TRIGGER AS $$
DECLARE
  v_description text;
  v_severity event_severity;
BEGIN
  -- Determine description and severity based on status
  IF NEW.status = 'success'::device_session_status THEN
    v_description := format('Wake session completed successfully (%s ms)', NEW.session_duration_ms);
    v_severity := 'info';
  ELSIF NEW.status = 'failed'::device_session_status THEN
    v_description := format('Wake session failed: %s', array_to_string(NEW.error_codes, ', '));
    v_severity := 'error';
  ELSIF NEW.status = 'partial'::device_session_status THEN
    v_description := format('Wake session partially completed (%s ms)', NEW.session_duration_ms);
    v_severity := 'warning';
  ELSE
    v_description := format('Wake session %s', NEW.status::text);
    v_severity := 'info';
  END IF;

  -- Only log completed or failed sessions (not every update)
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
    INSERT INTO device_history (
      device_id,
      company_id,
      program_id,
      site_id,
      session_id,
      event_category,
      event_type,
      severity,
      description,
      event_data,
      metadata,
      triggered_by,
      source_table,
      source_id,
      event_timestamp
    ) VALUES (
      NEW.device_id,
      NEW.company_id,
      NEW.program_id,
      NEW.site_id,
      NEW.session_id,
      'WakeSession',
      CASE
        WHEN NEW.status = 'success'::device_session_status THEN 'wake_completed'
        WHEN NEW.status = 'failed'::device_session_status THEN 'wake_failed'
        WHEN NEW.status = 'partial'::device_session_status THEN 'wake_partial'
        ELSE 'wake_' || NEW.status::text
      END,
      v_severity,
      v_description,
      jsonb_build_object(
        'session_duration_ms', NEW.session_duration_ms,
        'image_captured', NEW.image_captured,
        'chunks_sent', NEW.chunks_sent,
        'chunks_total', NEW.chunks_total,
        'chunks_missing', NEW.chunks_missing,
        'transmission_complete', NEW.transmission_complete,
        'next_wake_scheduled', NEW.next_wake_scheduled,
        'was_offline_capture', NEW.was_offline_capture,
        'pending_images_count', NEW.pending_images_count
      ),
      jsonb_build_object(
        'connection_success', NEW.connection_success,
        'wifi_retry_count', NEW.wifi_retry_count,
        'mqtt_connected', NEW.mqtt_connected,
        'error_codes', NEW.error_codes,
        'telemetry_data', NEW.telemetry_data,
        'wake_variance_minutes', NEW.wake_variance_minutes
      ),
      'device',
      'device_wake_sessions',
      NEW.session_id,
      NEW.wake_timestamp
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_wake_session ON device_wake_sessions;
CREATE TRIGGER trigger_log_wake_session
AFTER INSERT OR UPDATE ON device_wake_sessions
FOR EACH ROW
EXECUTE FUNCTION log_device_wake_session();

-- ============================================================================
-- C. Device Alerts
-- ============================================================================
CREATE OR REPLACE FUNCTION log_device_alert()
RETURNS TRIGGER AS $$
BEGIN
  -- Log alert creation
  IF TG_OP = 'INSERT' THEN
    INSERT INTO device_history (
      device_id,
      company_id,
      program_id,
      site_id,
      event_category,
      event_type,
      severity,
      description,
      event_data,
      metadata,
      triggered_by,
      source_table,
      source_id,
      user_id,
      event_timestamp
    ) VALUES (
      NEW.device_id,
      NEW.company_id,
      NEW.program_id,
      NEW.site_id,
      'Alert',
      'alert_triggered_' || NEW.alert_type,
      NEW.severity,
      NEW.message,
      jsonb_build_object(
        'alert_type', NEW.alert_type,
        'alert_id', NEW.alert_id,
        'metadata', NEW.metadata
      ),
      jsonb_build_object(
        'notification_sent', NEW.notification_sent,
        'resolved_at', NEW.resolved_at,
        'resolution_notes', NEW.resolution_notes
      ),
      'system',
      'device_alerts',
      NEW.alert_id,
      NEW.resolved_by_user_id,
      NEW.triggered_at
    );
  END IF;

  -- Log alert resolution
  IF TG_OP = 'UPDATE' AND OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN
    INSERT INTO device_history (
      device_id,
      company_id,
      program_id,
      site_id,
      event_category,
      event_type,
      severity,
      description,
      event_data,
      metadata,
      triggered_by,
      source_table,
      source_id,
      user_id,
      event_timestamp
    ) VALUES (
      NEW.device_id,
      NEW.company_id,
      NEW.program_id,
      NEW.site_id,
      'Alert',
      'alert_resolved_' || NEW.alert_type,
      'info',
      format('Alert resolved: %s', NEW.message),
      jsonb_build_object(
        'alert_type', NEW.alert_type,
        'alert_id', NEW.alert_id,
        'original_severity', NEW.severity,
        'resolution_notes', NEW.resolution_notes
      ),
      jsonb_build_object(
        'triggered_at', NEW.triggered_at,
        'duration_hours', EXTRACT(EPOCH FROM (NEW.resolved_at - NEW.triggered_at)) / 3600
      ),
      'user',
      'device_alerts',
      NEW.alert_id,
      NEW.resolved_by_user_id,
      NEW.resolved_at
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_device_alert ON device_alerts;
CREATE TRIGGER trigger_log_device_alert
AFTER INSERT OR UPDATE ON device_alerts
FOR EACH ROW
EXECUTE FUNCTION log_device_alert();

-- ============================================================================
-- D. Device Commands
-- ============================================================================
CREATE OR REPLACE FUNCTION log_device_command()
RETURNS TRIGGER AS $$
DECLARE
  v_description text;
  v_severity event_severity;
  v_event_type text;
BEGIN
  -- Determine event type and description
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'command_issued_' || NEW.command_type;
    v_description := format('Command issued: %s', NEW.command_type);
    v_severity := 'info';
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    v_event_type := 'command_' || NEW.status || '_' || NEW.command_type;

    CASE NEW.status
      WHEN 'completed' THEN
        v_description := format('Command completed: %s', NEW.command_type);
        v_severity := 'info';
      WHEN 'failed' THEN
        v_description := format('Command failed: %s - %s', NEW.command_type, NEW.error_message);
        v_severity := 'error';
      WHEN 'acknowledged' THEN
        v_description := format('Command acknowledged: %s', NEW.command_type);
        v_severity := 'info';
      ELSE
        v_description := format('Command %s: %s', NEW.status, NEW.command_type);
        v_severity := 'info';
    END CASE;
  ELSE
    RETURN NEW; -- Don't log other updates
  END IF;

  INSERT INTO device_history (
    device_id,
    company_id,
    program_id,
    site_id,
    event_category,
    event_type,
    severity,
    description,
    event_data,
    metadata,
    triggered_by,
    source_table,
    source_id,
    user_id,
    event_timestamp
  ) VALUES (
    NEW.device_id,
    NEW.company_id,
    NEW.program_id,
    NEW.site_id,
    'Command',
    v_event_type,
    v_severity,
    v_description,
    jsonb_build_object(
      'command_type', NEW.command_type,
      'command_payload', NEW.command_payload,
      'status', NEW.status,
      'priority', NEW.priority,
      'scheduled_for', NEW.scheduled_for
    ),
    jsonb_build_object(
      'issued_at', NEW.issued_at,
      'delivered_at', NEW.delivered_at,
      'acknowledged_at', NEW.acknowledged_at,
      'completed_at', NEW.completed_at,
      'retry_count', NEW.retry_count,
      'max_retries', NEW.max_retries,
      'error_message', NEW.error_message,
      'notes', NEW.notes
    ),
    CASE WHEN NEW.created_by_user_id IS NOT NULL THEN 'user' ELSE 'system' END,
    'device_commands',
    NEW.command_id,
    NEW.created_by_user_id,
    COALESCE(NEW.completed_at, NEW.acknowledged_at, NEW.delivered_at, NEW.issued_at)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_device_command ON device_commands;
CREATE TRIGGER trigger_log_device_command
AFTER INSERT OR UPDATE ON device_commands
FOR EACH ROW
EXECUTE FUNCTION log_device_command();

-- ============================================================================
-- E. Device Telemetry (Summarized - Every 10th reading or significant changes)
-- ============================================================================
CREATE OR REPLACE FUNCTION log_device_telemetry_summary()
RETURNS TRIGGER AS $$
DECLARE
  v_recent_count integer;
  v_last_logged_temp numeric;
  v_last_logged_humidity numeric;
  v_temp_change numeric;
  v_humidity_change numeric;
BEGIN
  -- Count recent telemetry logs in last 30 minutes
  SELECT COUNT(*) INTO v_recent_count
  FROM device_history
  WHERE device_id = NEW.device_id
    AND event_category = 'EnvironmentalReading'
    AND event_timestamp > now() - interval '30 minutes';

  -- Get last logged values
  SELECT
    (event_data->>'temperature')::numeric,
    (event_data->>'humidity')::numeric
  INTO v_last_logged_temp, v_last_logged_humidity
  FROM device_history
  WHERE device_id = NEW.device_id
    AND event_category = 'EnvironmentalReading'
  ORDER BY event_timestamp DESC
  LIMIT 1;

  -- Calculate changes
  v_temp_change := ABS(COALESCE(NEW.temperature, 0) - COALESCE(v_last_logged_temp, 0));
  v_humidity_change := ABS(COALESCE(NEW.humidity, 0) - COALESCE(v_last_logged_humidity, 0));

  -- Log if: no recent logs OR significant change
  IF v_recent_count = 0 OR v_temp_change > 5 OR v_humidity_change > 10 THEN
    INSERT INTO device_history (
      device_id,
      company_id,
      program_id,
      site_id,
      event_category,
      event_type,
      severity,
      description,
      event_data,
      metadata,
      triggered_by,
      source_table,
      source_id,
      event_timestamp
    ) VALUES (
      NEW.device_id,
      NEW.company_id,
      NEW.program_id,
      NEW.site_id,
      'EnvironmentalReading',
      'telemetry_reading',
      'info',
      format('Temp: %.1f°C, Humidity: %.1f%%, Pressure: %.1f hPa',
             NEW.temperature, NEW.humidity, NEW.pressure),
      jsonb_build_object(
        'temperature', NEW.temperature,
        'humidity', NEW.humidity,
        'pressure', NEW.pressure,
        'gas_resistance', NEW.gas_resistance,
        'battery_voltage', NEW.battery_voltage,
        'wifi_rssi', NEW.wifi_rssi
      ),
      jsonb_build_object(
        'temp_change', v_temp_change,
        'humidity_change', v_humidity_change,
        'is_significant_change', (v_temp_change > 5 OR v_humidity_change > 10)
      ),
      'device',
      'device_telemetry',
      NEW.telemetry_id,
      NEW.captured_at
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_telemetry_summary ON device_telemetry;
CREATE TRIGGER trigger_log_telemetry_summary
AFTER INSERT ON device_telemetry
FOR EACH ROW
EXECUTE FUNCTION log_device_telemetry_summary();

-- ============================================================================
-- 3. BACKFILL EXISTING EVENTS
-- ============================================================================

-- Backfill device schedule changes
INSERT INTO device_history (
  device_id,
  company_id,
  event_category,
  event_type,
  severity,
  description,
  event_data,
  metadata,
  triggered_by,
  source_table,
  source_id,
  user_id,
  event_timestamp,
  created_at
)
SELECT
  dsc.device_id,
  dsc.company_id,
  'ConfigurationChange'::device_event_category,
  'wake_schedule_updated',
  'info'::event_severity,
  format('Wake schedule changed to: %s (effective: %s)',
         dsc.new_wake_schedule_cron, dsc.effective_date),
  jsonb_build_object(
    'new_schedule', dsc.new_wake_schedule_cron,
    'effective_date', dsc.effective_date
  ),
  jsonb_build_object(
    'requested_at', dsc.requested_at,
    'applied_at', dsc.applied_at,
    'applied_by_function', dsc.applied_by_function
  ),
  'user',
  'device_schedule_changes',
  dsc.change_id,
  dsc.requested_by_user_id,
  COALESCE(dsc.applied_at, dsc.requested_at),
  COALESCE(dsc.applied_at, dsc.requested_at)
FROM device_schedule_changes dsc
WHERE NOT EXISTS (
  SELECT 1 FROM device_history
  WHERE source_table = 'device_schedule_changes'
  AND source_id = dsc.change_id
);

-- Backfill completed wake sessions
INSERT INTO device_history (
  device_id,
  company_id,
  program_id,
  site_id,
  session_id,
  event_category,
  event_type,
  severity,
  description,
  event_data,
  metadata,
  triggered_by,
  source_table,
  source_id,
  event_timestamp,
  created_at
)
SELECT
  dws.device_id,
  dws.company_id,
  dws.program_id,
  dws.site_id,
  dws.session_id,
  'WakeSession'::device_event_category,
  CASE
    WHEN dws.status = 'success'::device_session_status THEN 'wake_completed'
    WHEN dws.status = 'failed'::device_session_status THEN 'wake_failed'
    WHEN dws.status = 'partial'::device_session_status THEN 'wake_partial'
    ELSE 'wake_' || dws.status::text
  END,
  CASE
    WHEN dws.status = 'success'::device_session_status THEN 'info'::event_severity
    WHEN dws.status = 'failed'::device_session_status THEN 'error'::event_severity
    ELSE 'warning'::event_severity
  END,
  CASE
    WHEN dws.status = 'success'::device_session_status THEN format('Wake session completed successfully (%s ms)', dws.session_duration_ms)
    WHEN dws.status = 'failed'::device_session_status THEN format('Wake session failed: %s', array_to_string(dws.error_codes, ', '))
    ELSE format('Wake session %s', dws.status::text)
  END,
  jsonb_build_object(
    'session_duration_ms', dws.session_duration_ms,
    'image_captured', dws.image_captured,
    'chunks_sent', dws.chunks_sent,
    'chunks_total', dws.chunks_total,
    'chunks_missing', dws.chunks_missing,
    'transmission_complete', dws.transmission_complete,
    'next_wake_scheduled', dws.next_wake_scheduled,
    'was_offline_capture', dws.was_offline_capture,
    'pending_images_count', dws.pending_images_count
  ),
  jsonb_build_object(
    'connection_success', dws.connection_success,
    'wifi_retry_count', dws.wifi_retry_count,
    'mqtt_connected', dws.mqtt_connected,
    'error_codes', dws.error_codes,
    'telemetry_data', dws.telemetry_data,
    'wake_variance_minutes', dws.wake_variance_minutes
  ),
  'device',
  'device_wake_sessions',
  dws.session_id,
  dws.wake_timestamp,
  dws.created_at
FROM device_wake_sessions dws
WHERE dws.status IN ('success'::device_session_status, 'failed'::device_session_status, 'partial'::device_session_status)
  AND NOT EXISTS (
    SELECT 1 FROM device_history
    WHERE source_table = 'device_wake_sessions'
    AND source_id = dws.session_id
  );

-- Backfill device alerts
INSERT INTO device_history (
  device_id,
  company_id,
  program_id,
  site_id,
  event_category,
  event_type,
  severity,
  description,
  event_data,
  metadata,
  triggered_by,
  source_table,
  source_id,
  user_id,
  event_timestamp,
  created_at
)
SELECT
  da.device_id,
  da.company_id,
  da.program_id,
  da.site_id,
  'Alert'::device_event_category,
  'alert_triggered_' || da.alert_type,
  da.severity,
  da.message,
  jsonb_build_object(
    'alert_type', da.alert_type,
    'alert_id', da.alert_id,
    'metadata', da.metadata
  ),
  jsonb_build_object(
    'notification_sent', da.notification_sent,
    'resolved_at', da.resolved_at,
    'resolution_notes', da.resolution_notes
  ),
  'system',
  'device_alerts',
  da.alert_id,
  da.resolved_by_user_id,
  da.triggered_at,
  da.triggered_at
FROM device_alerts da
WHERE NOT EXISTS (
  SELECT 1 FROM device_history
  WHERE source_table = 'device_alerts'
  AND source_id = da.alert_id
  AND event_type LIKE 'alert_triggered_%'
);

-- Backfill device commands
INSERT INTO device_history (
  device_id,
  company_id,
  program_id,
  site_id,
  event_category,
  event_type,
  severity,
  description,
  event_data,
  metadata,
  triggered_by,
  source_table,
  source_id,
  user_id,
  event_timestamp,
  created_at
)
SELECT
  dc.device_id,
  dc.company_id,
  dc.program_id,
  dc.site_id,
  'Command'::device_event_category,
  'command_issued_' || dc.command_type,
  'info'::event_severity,
  format('Command issued: %s', dc.command_type),
  jsonb_build_object(
    'command_type', dc.command_type,
    'command_payload', dc.command_payload,
    'status', dc.status,
    'priority', dc.priority,
    'scheduled_for', dc.scheduled_for
  ),
  jsonb_build_object(
    'issued_at', dc.issued_at,
    'delivered_at', dc.delivered_at,
    'acknowledged_at', dc.acknowledged_at,
    'completed_at', dc.completed_at,
    'retry_count', dc.retry_count,
    'max_retries', dc.max_retries,
    'error_message', dc.error_message,
    'notes', dc.notes
  ),
  CASE WHEN dc.created_by_user_id IS NOT NULL THEN 'user' ELSE 'system' END,
  'device_commands',
  dc.command_id,
  dc.created_by_user_id,
  dc.issued_at,
  dc.issued_at
FROM device_commands dc
WHERE NOT EXISTS (
  SELECT 1 FROM device_history
  WHERE source_table = 'device_commands'
  AND source_id = dc.command_id
);

-- ============================================================================
-- 4. CREATE HELPER VIEW FOR UNIFIED EVENTS
-- ============================================================================

CREATE OR REPLACE VIEW device_events_unified AS
SELECT
  history_id as event_id,
  device_id,
  company_id,
  program_id,
  site_id,
  session_id,
  event_category,
  event_type,
  severity,
  event_timestamp,
  description,
  event_data,
  metadata,
  triggered_by,
  source_table,
  source_id,
  user_id,
  created_at
FROM device_history
ORDER BY event_timestamp DESC;

-- Grant access to view
GRANT SELECT ON device_events_unified TO authenticated;

COMMENT ON VIEW device_events_unified IS 'Unified view of all device events from device_history table';
