/*
  # Device History Automatic Event Logging Triggers

  This migration creates triggers to automatically log device history events for state changes.

  ## Triggers Created

  1. Device assignment/unassignment via device_site_assignments
  2. Device activation/deactivation
  3. Battery status changes (threshold-based)
  4. Device image completion
*/

-- ============================================
-- TRIGGER 1: Device Site Assignment Events
-- ============================================

CREATE OR REPLACE FUNCTION log_device_assignment_history()
RETURNS TRIGGER AS $$
DECLARE
  v_site_name TEXT;
  v_program_name TEXT;
  v_user_email TEXT;
BEGIN
  -- Get related names
  SELECT name INTO v_site_name FROM sites WHERE site_id = NEW.site_id;
  SELECT name INTO v_program_name FROM pilot_programs WHERE program_id = NEW.program_id;
  SELECT email INTO v_user_email FROM users WHERE id = NEW.assigned_by_user_id;

  -- Log assignment event
  IF (TG_OP = 'INSERT' AND NEW.is_active = true) THEN
    PERFORM add_device_history_event(
      p_device_id := NEW.device_id,
      p_event_category := 'Assignment',
      p_event_type := 'device_assigned_to_site',
      p_severity := 'info',
      p_description := format('Device assigned to site %s in program %s', v_site_name, v_program_name),
      p_event_data := jsonb_build_object(
        'site_id', NEW.site_id,
        'site_name', v_site_name,
        'program_id', NEW.program_id,
        'program_name', v_program_name,
        'is_primary', NEW.is_primary,
        'assigned_by', v_user_email,
        'reason', NEW.reason,
        'notes', NEW.notes
      ),
      p_user_id := NEW.assigned_by_user_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_device_assignment
  AFTER INSERT ON device_site_assignments
  FOR EACH ROW
  EXECUTE FUNCTION log_device_assignment_history();

-- ============================================
-- TRIGGER 2: Device Site Unassignment Events
-- ============================================

CREATE OR REPLACE FUNCTION log_device_unassignment_history()
RETURNS TRIGGER AS $$
DECLARE
  v_site_name TEXT;
  v_program_name TEXT;
  v_user_email TEXT;
BEGIN
  -- Only log when a device is unassigned (is_active changes to false or unassigned_at is set)
  IF (OLD.is_active = true AND NEW.is_active = false) OR (OLD.unassigned_at IS NULL AND NEW.unassigned_at IS NOT NULL) THEN
    -- Get related names
    SELECT name INTO v_site_name FROM sites WHERE site_id = NEW.site_id;
    SELECT name INTO v_program_name FROM pilot_programs WHERE program_id = NEW.program_id;
    SELECT email INTO v_user_email FROM users WHERE id = NEW.unassigned_by_user_id;

    PERFORM add_device_history_event(
      p_device_id := NEW.device_id,
      p_event_category := 'Unassignment',
      p_event_type := 'device_unassigned_from_site',
      p_severity := 'info',
      p_description := format('Device unassigned from site %s in program %s', v_site_name, v_program_name),
      p_event_data := jsonb_build_object(
        'site_id', NEW.site_id,
        'site_name', v_site_name,
        'program_id', NEW.program_id,
        'program_name', v_program_name,
        'unassigned_by', v_user_email,
        'reason', NEW.reason,
        'assignment_duration_days', EXTRACT(EPOCH FROM (NEW.unassigned_at - NEW.assigned_at)) / 86400
      ),
      p_user_id := NEW.unassigned_by_user_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_device_unassignment
  AFTER UPDATE ON device_site_assignments
  FOR EACH ROW
  EXECUTE FUNCTION log_device_unassignment_history();

-- ============================================
-- TRIGGER 3: Device Activation/Deactivation Events
-- ============================================

CREATE OR REPLACE FUNCTION log_device_activation_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Log activation event
  IF OLD.is_active = false AND NEW.is_active = true THEN
    PERFORM add_device_history_event(
      p_device_id := NEW.device_id,
      p_event_category := 'Activation',
      p_event_type := 'device_activated',
      p_severity := 'info',
      p_description := format('Device %s activated', COALESCE(NEW.device_name, NEW.device_mac)),
      p_event_data := jsonb_build_object(
        'device_mac', NEW.device_mac,
        'device_code', NEW.device_code,
        'provisioning_status', NEW.provisioning_status,
        'firmware_version', NEW.firmware_version
      )
    );
  END IF;

  -- Log deactivation event
  IF OLD.is_active = true AND NEW.is_active = false THEN
    PERFORM add_device_history_event(
      p_device_id := NEW.device_id,
      p_event_category := 'Deactivation',
      p_event_type := 'device_deactivated',
      p_severity := 'warning',
      p_description := format('Device %s deactivated', COALESCE(NEW.device_name, NEW.device_mac)),
      p_event_data := jsonb_build_object(
        'device_mac', NEW.device_mac,
        'device_code', NEW.device_code,
        'previous_status', OLD.provisioning_status,
        'notes', NEW.notes
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_device_activation
  AFTER UPDATE OF is_active ON devices
  FOR EACH ROW
  EXECUTE FUNCTION log_device_activation_history();

-- ============================================
-- TRIGGER 4: Battery Status Change Events
-- ============================================

CREATE OR REPLACE FUNCTION log_battery_status_history()
RETURNS TRIGGER AS $$
DECLARE
  v_old_percent NUMERIC;
  v_new_percent NUMERIC;
  v_severity event_severity;
  v_event_type TEXT;
BEGIN
  v_old_percent := COALESCE(OLD.battery_health_percent, 100);
  v_new_percent := COALESCE(NEW.battery_health_percent, 100);

  -- Only log if battery changed significantly or crossed thresholds
  IF ABS(v_new_percent - v_old_percent) >= 15 OR
     (v_old_percent > 20 AND v_new_percent <= 20) OR
     (v_old_percent > 10 AND v_new_percent <= 10) OR
     (v_old_percent <= 10 AND v_new_percent > 10) OR
     (v_old_percent <= 20 AND v_new_percent > 20) THEN

    -- Determine severity and event type
    IF v_new_percent <= 10 THEN
      v_severity := 'critical';
      v_event_type := 'battery_critical';
    ELSIF v_new_percent <= 20 THEN
      v_severity := 'warning';
      v_event_type := 'battery_low';
    ELSIF v_new_percent > v_old_percent AND v_old_percent <= 20 THEN
      v_severity := 'info';
      v_event_type := 'battery_recovered';
    ELSE
      v_severity := 'info';
      v_event_type := 'battery_status_update';
    END IF;

    PERFORM add_device_history_event(
      p_device_id := NEW.device_id,
      p_event_category := 'BatteryStatus',
      p_event_type := v_event_type,
      p_severity := v_severity,
      p_description := format('Battery level at %s%% (was %s%%)',
        ROUND(v_new_percent, 1),
        ROUND(v_old_percent, 1)
      ),
      p_event_data := jsonb_build_object(
        'battery_health_percent', NEW.battery_health_percent,
        'battery_voltage', NEW.battery_voltage,
        'previous_health_percent', OLD.battery_health_percent,
        'previous_voltage', OLD.battery_voltage,
        'change_percent', v_new_percent - v_old_percent
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_battery_status
  AFTER UPDATE OF battery_health_percent, battery_voltage ON devices
  FOR EACH ROW
  WHEN (NEW.battery_health_percent IS DISTINCT FROM OLD.battery_health_percent
        OR NEW.battery_voltage IS DISTINCT FROM OLD.battery_voltage)
  EXECUTE FUNCTION log_battery_status_history();

-- ============================================
-- TRIGGER 5: Device Image Completion Events
-- ============================================

CREATE OR REPLACE FUNCTION log_device_image_history()
RETURNS TRIGGER AS $$
DECLARE
  v_severity event_severity;
  v_event_type TEXT;
  v_description TEXT;
BEGIN
  -- Only log on insert or when status changes to complete/failed
  IF (TG_OP = 'INSERT') OR
     (TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status IN ('complete', 'failed')) THEN

    -- Determine event details based on status
    CASE NEW.status
      WHEN 'complete' THEN
        v_severity := 'info';
        v_event_type := 'image_capture_success';
        v_description := format('Image captured successfully (%s chunks)', NEW.total_chunks);
      WHEN 'failed' THEN
        v_severity := 'error';
        v_event_type := 'image_capture_failed';
        v_description := format('Image capture failed: %s', COALESCE(NEW.error_message, 'Unknown error'));
      WHEN 'receiving' THEN
        v_severity := 'info';
        v_event_type := 'image_transmission_started';
        v_description := format('Image transmission started (%s chunks)', NEW.total_chunks);
      ELSE
        RETURN NEW; -- Don't log other statuses
    END CASE;

    PERFORM add_device_history_event(
      p_device_id := NEW.device_id,
      p_event_category := 'ImageCapture',
      p_event_type := v_event_type,
      p_severity := v_severity,
      p_description := v_description,
      p_event_data := jsonb_build_object(
        'image_id', NEW.image_id,
        'image_url', NEW.image_url,
        'storage_path', NEW.storage_path,
        'total_chunks', NEW.total_chunks,
        'received_chunks', NEW.received_chunks,
        'status', NEW.status,
        'error_message', NEW.error_message,
        'captured_at', NEW.captured_at,
        'device_metadata', NEW.device_metadata
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_device_image
  AFTER INSERT OR UPDATE OF status ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION log_device_image_history();

-- ============================================
-- TRIGGER 6: Device Provisioning Status Changes
-- ============================================

CREATE OR REPLACE FUNCTION log_device_provisioning_history()
RETURNS TRIGGER AS $$
DECLARE
  v_severity event_severity;
  v_description TEXT;
BEGIN
  -- Only log when provisioning status actually changes
  IF OLD.provisioning_status IS DISTINCT FROM NEW.provisioning_status THEN

    -- Determine severity based on status progression
    CASE NEW.provisioning_status
      WHEN 'active' THEN
        v_severity := 'info';
        v_description := format('Device %s provisioning complete - now active',
          COALESCE(NEW.device_name, NEW.device_mac));
      WHEN 'mapped' THEN
        v_severity := 'info';
        v_description := format('Device %s mapped to site',
          COALESCE(NEW.device_name, NEW.device_mac));
      WHEN 'pending_mapping' THEN
        v_severity := 'info';
        v_description := format('Device %s registered - pending site mapping',
          COALESCE(NEW.device_name, NEW.device_mac));
      ELSE
        v_severity := 'info';
        v_description := format('Device %s provisioning status changed to %s',
          COALESCE(NEW.device_name, NEW.device_mac),
          NEW.provisioning_status);
    END CASE;

    PERFORM add_device_history_event(
      p_device_id := NEW.device_id,
      p_event_category := 'ProvisioningStep',
      p_event_type := 'provisioning_status_changed',
      p_severity := v_severity,
      p_description := v_description,
      p_event_data := jsonb_build_object(
        'old_status', OLD.provisioning_status,
        'new_status', NEW.provisioning_status,
        'device_mac', NEW.device_mac,
        'device_code', NEW.device_code,
        'firmware_version', NEW.firmware_version,
        'provisioned_at', NEW.provisioned_at,
        'mapped_at', NEW.mapped_at
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_device_provisioning
  AFTER UPDATE OF provisioning_status ON devices
  FOR EACH ROW
  EXECUTE FUNCTION log_device_provisioning_history();

-- ============================================
-- Comments
-- ============================================

COMMENT ON FUNCTION log_device_assignment_history() IS 'Automatically logs device history event when device is assigned to a site';
COMMENT ON FUNCTION log_device_unassignment_history() IS 'Automatically logs device history event when device is unassigned from a site';
COMMENT ON FUNCTION log_device_activation_history() IS 'Automatically logs device history event when device is activated or deactivated';
COMMENT ON FUNCTION log_battery_status_history() IS 'Automatically logs device history event when battery level changes significantly or crosses thresholds (20%, 10%)';
COMMENT ON FUNCTION log_device_image_history() IS 'Automatically logs device history event when image capture completes or fails';
COMMENT ON FUNCTION log_device_provisioning_history() IS 'Automatically logs device history event when provisioning status changes';
