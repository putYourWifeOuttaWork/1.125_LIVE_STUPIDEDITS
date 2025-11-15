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

  NOTE: Enum values 'Alert' and 'Command' must already exist in device_event_category
  They are added by migration 20251116000009_add_event_category_enums.sql
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
  ON device_history(program_id, site_id, event_timestamp DESC)
  WHERE program_id IS NOT NULL AND site_id IS NOT NULL;

-- ============================================================================
-- 2. TRIGGER FUNCTIONS
-- ============================================================================

-- A. Device Schedule Changes
-- ============================================================================
CREATE OR REPLACE FUNCTION log_device_schedule_change()
RETURNS TRIGGER AS $$
DECLARE
  v_program_id uuid;
  v_site_id uuid;
BEGIN
  -- Get program_id and site_id from devices table
  SELECT program_id, site_id INTO v_program_id, v_site_id
  FROM devices
  WHERE device_id = NEW.device_id;

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
    v_program_id,
    v_site_id,
    'ConfigurationChange',
    'wake_schedule_updated',
    'info',
    format('Wake schedule changed to: %s (effective: %s)', NEW.new_wake_schedule_cron, NEW.effective_date::date),
    jsonb_build_object(
      'new_schedule', NEW.new_wake_schedule_cron,
      'effective_date', NEW.effective_date
    ),
    jsonb_build_object(
      'requested_at', NEW.requested_at,
      'applied_at', NEW.applied_at,
      'requested_by_user_id', NEW.requested_by_user_id
    ),
    'user',
    'device_schedule_changes',
    NEW.change_id,
    NEW.requested_by_user_id,
    NEW.requested_at
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_schedule_change ON device_schedule_changes;
CREATE TRIGGER trigger_log_schedule_change
AFTER INSERT ON device_schedule_changes
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
      NEW.severity::text::event_severity,
      format('Alert triggered: %s', NEW.message),
      jsonb_build_object(
        'alert_type', NEW.alert_type,
        'message', NEW.message,
        'metric_name', NEW.metric_name,
        'metric_value', NEW.metric_value,
        'threshold_value', NEW.threshold_value
      ),
      jsonb_build_object(
        'alert_id', NEW.alert_id,
        'is_resolved', NEW.is_resolved
      ),
      'device',
      'device_alerts',
      NEW.alert_id,
      NULL,
      NEW.triggered_at
    );
  END IF;

  -- Log alert resolution
  IF TG_OP = 'UPDATE' AND OLD.is_resolved = false AND NEW.is_resolved = true THEN
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
        'message', NEW.message,
        'resolution_note', NEW.resolution_note
      ),
      jsonb_build_object(
        'alert_id', NEW.alert_id,
        'triggered_at', NEW.triggered_at,
        'resolved_at', NEW.resolved_at
      ),
      COALESCE(NEW.resolved_by_type, 'system'),
      'device_alerts',
      NEW.alert_id,
      NEW.resolved_by,
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
  v_event_type text;
  v_severity event_severity;
BEGIN
  -- Determine event details based on command status
  IF TG_OP = 'INSERT' THEN
    v_description := format('Command issued: %s', NEW.command_type);
    v_event_type := 'command_issued_' || NEW.command_type;
    v_severity := 'info';
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    IF NEW.status = 'acknowledged' THEN
      v_description := format('Command acknowledged: %s', NEW.command_type);
      v_event_type := 'command_ack_' || NEW.command_type;
      v_severity := 'info';
    ELSIF NEW.status = 'failed' THEN
      v_description := format('Command failed: %s - %s', NEW.command_type, NEW.error_message);
      v_event_type := 'command_failed_' || NEW.command_type;
      v_severity := 'error';
    ELSE
      v_description := format('Command %s: %s', NEW.status, NEW.command_type);
      v_event_type := 'command_' || NEW.status || '_' || NEW.command_type;
      v_severity := 'info';
    END IF;
  ELSE
    RETURN NEW; -- Skip if not INSERT or status change
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
      'parameters', NEW.parameters,
      'status', NEW.status,
      'priority', NEW.priority
    ),
    jsonb_build_object(
      'command_id', NEW.command_id,
      'issued_at', NEW.issued_at,
      'acknowledged_at', NEW.acknowledged_at,
      'completed_at', NEW.completed_at,
      'error_message', NEW.error_message
    ),
    CASE WHEN TG_OP = 'INSERT' THEN 'user' ELSE 'device' END,
    'device_commands',
    NEW.command_id,
    NEW.issued_by,
    COALESCE(NEW.acknowledged_at, NEW.delivered_at, NEW.issued_at)
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
  v_last_logged_telemetry_id uuid;
  v_reading_count int;
  v_should_log boolean := false;
BEGIN
  -- Check if we should log this telemetry reading
  -- Log every 10th reading or if there's a significant change

  SELECT source_id INTO v_last_logged_telemetry_id
  FROM device_history
  WHERE device_id = NEW.device_id
    AND event_category = 'EnvironmentalReading'
    AND source_table = 'device_telemetry'
  ORDER BY event_timestamp DESC
  LIMIT 1;

  SELECT COUNT(*) INTO v_reading_count
  FROM device_telemetry
  WHERE device_id = NEW.device_id
    AND telemetry_id > COALESCE(v_last_logged_telemetry_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND event_category = 'EnvironmentalReading'
  ORDER BY created_at DESC;

  -- Log every 10th reading
  IF v_reading_count >= 10 THEN
    v_should_log := true;
  END IF;

  -- Log if temperature or humidity changed significantly (>5 degrees or >10%)
  -- This would require comparing with last logged value (simplified here)

  IF v_should_log THEN
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
      format('Environmental reading: Temp %.1f°C, Humidity %.1f%%', NEW.temperature, NEW.humidity),
      jsonb_build_object(
        'temperature', NEW.temperature,
        'humidity', NEW.humidity,
        'battery_voltage', NEW.battery_voltage,
        'signal_strength', NEW.signal_strength
      ),
      jsonb_build_object(
        'telemetry_id', NEW.telemetry_id,
        'reading_sequence', v_reading_count
      ),
      'device',
      'device_telemetry',
      NEW.telemetry_id,
      NEW.created_at
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
-- 3. BACKFILL EXISTING DATA
-- ============================================================================

-- A. Backfill schedule changes
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
  dsc.device_id,
  dsc.company_id,
  d.program_id,
  d.site_id,
  'ConfigurationChange'::device_event_category,
  'wake_schedule_updated',
  'info'::event_severity,
  format('Wake schedule changed to: %s (effective: %s)', dsc.new_wake_schedule_cron, dsc.effective_date::date),
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
  dsc.requested_at,
  dsc.requested_at
FROM device_schedule_changes dsc
INNER JOIN devices d ON d.device_id = dsc.device_id
WHERE NOT EXISTS (
  SELECT 1 FROM device_history dh
  WHERE dh.source_table = 'device_schedule_changes'
    AND dh.source_id = dsc.change_id
);

-- B. Backfill wake sessions (only completed/failed/partial)
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
    SELECT 1 FROM device_history dh
    WHERE dh.source_table = 'device_wake_sessions'
      AND dh.source_id = dws.session_id
  );

-- C. Backfill alerts
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
  d.program_id,
  d.site_id,
  'Alert'::device_event_category,
  'alert_triggered_' || da.alert_type,
  da.severity::text::event_severity,
  format('Alert triggered: %s', da.message),
  jsonb_build_object(
    'alert_type', da.alert_type,
    'message', da.message
  ),
  jsonb_build_object(
    'alert_id', da.alert_id,
    'metadata', da.metadata,
    'resolved_at', da.resolved_at,
    'resolution_notes', da.resolution_notes
  ),
  'device',
  'device_alerts',
  da.alert_id,
  NULL,
  da.triggered_at,
  da.triggered_at
FROM device_alerts da
INNER JOIN devices d ON d.device_id = da.device_id
WHERE NOT EXISTS (
  SELECT 1 FROM device_history dh
  WHERE dh.source_table = 'device_alerts'
    AND dh.source_id = da.alert_id
    AND dh.event_type LIKE 'alert_triggered_%'
);

-- D. Backfill commands
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
    'status', dc.status
  ),
  jsonb_build_object(
    'command_id', dc.command_id,
    'issued_at', dc.issued_at,
    'acknowledged_at', dc.acknowledged_at,
    'delivered_at', dc.delivered_at,
    'notes', dc.notes
  ),
  'user',
  'device_commands',
  dc.command_id,
  dc.created_by_user_id,
  dc.issued_at,
  dc.issued_at
FROM device_commands dc
WHERE NOT EXISTS (
  SELECT 1 FROM device_history dh
  WHERE dh.source_table = 'device_commands'
    AND dh.source_id = dc.command_id
);

-- ============================================================================
-- 4. CREATE UNIFIED VIEW
-- ============================================================================

CREATE OR REPLACE VIEW device_events_unified AS
SELECT
  history_id,
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
  user_id,
  event_timestamp,
  created_at,
  source_table,
  source_id,
  triggered_by
FROM device_history
ORDER BY event_timestamp DESC;

-- Grant access to authenticated users (RLS handles row-level security)
GRANT SELECT ON device_events_unified TO authenticated;
