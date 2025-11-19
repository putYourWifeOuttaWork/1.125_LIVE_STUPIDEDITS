-- Fix log_device_alert trigger to use correct column names
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
        'alert_category', NEW.alert_category,
        'message', NEW.message,
        'actual_value', NEW.actual_value,
        'threshold_value', NEW.threshold_value,
        'threshold_context', NEW.threshold_context
      ),
      jsonb_build_object(
        'alert_id', NEW.alert_id,
        'resolved_at', NEW.resolved_at,
        'zone_label', NEW.zone_label,
        'device_coords', NEW.device_coords
      ),
      'device',
      'device_alerts',
      NEW.alert_id,
      NULL,
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
