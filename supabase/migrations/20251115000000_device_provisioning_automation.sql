/*
  # Device Provisioning Automation

  1. Purpose
    - Automate device initialization after mapping to site/program
    - Calculate and populate all derived fields from lineage
    - Ensure consistent device state transitions
    - Support full MQTT protocol compliance per BrainlyTree PDF spec

  2. New Functions
    - fn_calculate_next_wake(p_cron_expression TEXT, p_from_timestamp TIMESTAMPTZ) → TIMESTAMPTZ
      * Calculate next wake time from cron expression
      * Used for device scheduling and ACK_OK messages

    - fn_initialize_device_after_mapping(p_device_id UUID, p_site_id UUID, p_program_id UUID) → JSONB
      * Automatically populate all device fields after mapping
      * Set site_id, program_id, company_id from junction tables
      * Calculate next_wake_at from wake_schedule_cron
      * Transition provisioning_status to 'mapped' then 'active'
      * Create device_history event
      * Return complete updated device record

    - fn_trigger_device_lineage_update() → TRIGGER
      * Automatically call fn_initialize_device_after_mapping
      * Fires on INSERT/UPDATE of device_site_assignments when is_active=TRUE

  3. Validation Rules
    - Ensures complete lineage chain exists
    - Validates site belongs to program
    - Verifies program belongs to company
    - Prevents orphaned device assignments

  4. Security
    - All functions use SECURITY DEFINER for system-level access
    - Creates audit trail in device_history
    - Tracks user_id for all operations
*/

-- ==========================================
-- UTILITY: CALCULATE NEXT WAKE TIME
-- ==========================================

CREATE OR REPLACE FUNCTION fn_calculate_next_wake(
  p_cron_expression TEXT,
  p_from_timestamp TIMESTAMPTZ DEFAULT now()
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_next_wake TIMESTAMPTZ;
  v_base_time TIMESTAMPTZ;
  v_parts TEXT[];
  v_minute TEXT;
  v_hour TEXT;
  v_day TEXT;
  v_month TEXT;
  v_dow TEXT;
  v_hours INT[];
  v_hour_val INT;
  v_current_hour INT;
BEGIN
  -- Handle NULL or empty cron
  IF p_cron_expression IS NULL OR p_cron_expression = '' THEN
    -- Default to 12 hours from now
    RETURN p_from_timestamp + INTERVAL '12 hours';
  END IF;

  -- Parse cron expression (minute hour day month dow)
  v_parts := string_to_array(p_cron_expression, ' ');

  IF array_length(v_parts, 1) != 5 THEN
    RAISE WARNING 'Invalid cron expression: %, defaulting to 12 hours', p_cron_expression;
    RETURN p_from_timestamp + INTERVAL '12 hours';
  END IF;

  v_minute := v_parts[1];
  v_hour := v_parts[2];
  v_day := v_parts[3];
  v_month := v_parts[4];
  v_dow := v_parts[5];

  -- Simple implementation for common patterns
  -- Supports: "0 8,16 * * *" (specific hours), "0 */6 * * *" (interval)

  v_base_time := date_trunc('hour', p_from_timestamp) + INTERVAL '1 hour';
  v_current_hour := EXTRACT(HOUR FROM p_from_timestamp)::INT;

  -- Handle comma-separated hours (e.g., "8,16")
  IF v_hour LIKE '%,%' THEN
    -- Parse hours
    SELECT array_agg(h::INT ORDER BY h::INT)
    INTO v_hours
    FROM unnest(string_to_array(v_hour, ',')) AS h
    WHERE h ~ '^\d+$';

    -- Find next hour that's greater than current
    SELECT MIN(h)
    INTO v_hour_val
    FROM unnest(v_hours) AS h
    WHERE h > v_current_hour;

    IF v_hour_val IS NULL THEN
      -- Wrap to next day, use first hour
      v_hour_val := v_hours[1];
      v_next_wake := date_trunc('day', p_from_timestamp) + INTERVAL '1 day';
    ELSE
      v_next_wake := date_trunc('day', p_from_timestamp);
    END IF;

    v_next_wake := v_next_wake + (v_hour_val || ' hours')::INTERVAL;

  -- Handle interval notation (e.g., "*/6")
  ELSIF v_hour LIKE '*/%' THEN
    DECLARE
      v_interval_hours INT;
    BEGIN
      v_interval_hours := substring(v_hour from '\*/(\d+)')::INT;
      -- Round up to next interval
      v_next_wake := v_base_time;
      WHILE EXTRACT(HOUR FROM v_next_wake)::INT % v_interval_hours != 0 LOOP
        v_next_wake := v_next_wake + INTERVAL '1 hour';
      END LOOP;
    END;

  -- Handle single hour (e.g., "8")
  ELSIF v_hour ~ '^\d+$' THEN
    v_hour_val := v_hour::INT;
    IF v_hour_val > v_current_hour THEN
      v_next_wake := date_trunc('day', p_from_timestamp) + (v_hour_val || ' hours')::INTERVAL;
    ELSE
      v_next_wake := date_trunc('day', p_from_timestamp) + INTERVAL '1 day' + (v_hour_val || ' hours')::INTERVAL;
    END IF;

  -- Handle wildcard (every hour)
  ELSIF v_hour = '*' THEN
    v_next_wake := v_base_time;

  ELSE
    RAISE WARNING 'Unsupported cron hour format: %, defaulting to 12 hours', v_hour;
    RETURN p_from_timestamp + INTERVAL '12 hours';
  END IF;

  RETURN v_next_wake;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error calculating next wake from cron %: %, defaulting to 12 hours', p_cron_expression, SQLERRM;
  RETURN p_from_timestamp + INTERVAL '12 hours';
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION fn_calculate_next_wake(TEXT, TIMESTAMPTZ) TO authenticated, service_role;

COMMENT ON FUNCTION fn_calculate_next_wake(TEXT, TIMESTAMPTZ) IS
'Calculate next wake timestamp from cron expression. Supports common patterns: specific hours (0 8,16 * * *), intervals (0 */6 * * *), single hour (0 8 * * *), wildcard (0 * * * *). Defaults to 12 hours if parsing fails.';

-- ==========================================
-- MAIN: INITIALIZE DEVICE AFTER MAPPING
-- ==========================================

CREATE OR REPLACE FUNCTION fn_initialize_device_after_mapping(
  p_device_id UUID,
  p_site_id UUID,
  p_program_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_site_data RECORD;
  v_program_data RECORD;
  v_device_data RECORD;
  v_next_wake TIMESTAMPTZ;
  v_updated_device JSONB;
  v_current_user_id UUID;
BEGIN
  -- Get current user (if available)
  BEGIN
    v_current_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_current_user_id := NULL;
  END;

  -- Step 1: Validate site exists and get metadata
  SELECT
    s.site_id,
    s.name as site_name,
    s.program_id as site_program_id,
    s.company_id,
    COALESCE(s.timezone, 'UTC') as timezone
  INTO v_site_data
  FROM sites s
  WHERE s.site_id = p_site_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'site_not_found',
      'message', format('Site %s not found', p_site_id)
    );
  END IF;

  -- Step 2: Validate program exists
  SELECT
    p.program_id,
    p.name as program_name,
    p.company_id as program_company_id
  INTO v_program_data
  FROM pilot_programs p
  WHERE p.program_id = p_program_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'program_not_found',
      'message', format('Program %s not found', p_program_id)
    );
  END IF;

  -- Step 3: Validate site belongs to program
  IF v_site_data.site_program_id != p_program_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'site_program_mismatch',
      'message', format('Site %s does not belong to program %s', p_site_id, p_program_id)
    );
  END IF;

  -- Step 4: Validate company consistency
  IF v_site_data.company_id != v_program_data.program_company_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'company_mismatch',
      'message', 'Site and program belong to different companies'
    );
  END IF;

  -- Step 5: Get current device data
  SELECT * INTO v_device_data
  FROM devices
  WHERE device_id = p_device_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'device_not_found',
      'message', format('Device %s not found', p_device_id)
    );
  END IF;

  -- Step 6: Calculate next wake time
  v_next_wake := fn_calculate_next_wake(
    v_device_data.wake_schedule_cron,
    now()
  );

  -- Step 7: Update device with complete lineage
  UPDATE devices
  SET
    site_id = p_site_id,
    program_id = p_program_id,
    company_id = v_site_data.company_id,
    provisioning_status = 'active',
    is_active = true,
    mapped_at = now(),
    mapped_by_user_id = v_current_user_id,
    next_wake_at = v_next_wake,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING to_jsonb(devices.*) INTO v_updated_device;

  -- Step 8: Create device history event
  INSERT INTO device_history (
    device_id,
    site_id,
    program_id,
    company_id,
    event_category,
    event_type,
    severity,
    event_timestamp,
    description,
    event_data,
    user_id
  ) VALUES (
    p_device_id,
    p_site_id,
    p_program_id,
    v_site_data.company_id,
    'provisioning',
    'device_mapped',
    'info',
    now(),
    format('Device %s mapped to site %s in program %s',
      v_device_data.device_name,
      v_site_data.site_name,
      v_program_data.program_name
    ),
    jsonb_build_object(
      'site_id', p_site_id,
      'site_name', v_site_data.site_name,
      'program_id', p_program_id,
      'program_name', v_program_data.program_name,
      'company_id', v_site_data.company_id,
      'timezone', v_site_data.timezone,
      'next_wake_at', v_next_wake,
      'wake_schedule_cron', v_device_data.wake_schedule_cron
    ),
    v_current_user_id
  );

  -- Step 9: Return success with updated device
  RETURN jsonb_build_object(
    'success', true,
    'device', v_updated_device,
    'site_name', v_site_data.site_name,
    'program_name', v_program_data.program_name,
    'company_id', v_site_data.company_id,
    'timezone', v_site_data.timezone,
    'next_wake_at', v_next_wake,
    'message', 'Device initialized successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_initialize_device_after_mapping error for device %: %', p_device_id, SQLERRM;

  RETURN jsonb_build_object(
    'success', false,
    'error', 'exception',
    'message', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_initialize_device_after_mapping(UUID, UUID, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION fn_initialize_device_after_mapping(UUID, UUID, UUID) IS
'Initialize device after mapping to site/program. Populates site_id, program_id, company_id, calculates next_wake_at, transitions to active status, creates history event. Returns JSONB with success flag and updated device data.';

-- ==========================================
-- TRIGGER: AUTO-UPDATE DEVICE LINEAGE
-- ==========================================

CREATE OR REPLACE FUNCTION fn_trigger_device_lineage_update()
RETURNS TRIGGER AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Only process active assignments
  IF NEW.is_active = TRUE THEN
    -- Call initialization function
    v_result := fn_initialize_device_after_mapping(
      NEW.device_id,
      NEW.site_id,
      NEW.program_id
    );

    -- Log result
    IF (v_result->>'success')::BOOLEAN THEN
      RAISE NOTICE 'Device lineage updated successfully for device %', NEW.device_id;
    ELSE
      RAISE WARNING 'Device lineage update failed for device %: %', NEW.device_id, v_result->>'message';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on device_site_assignments
DROP TRIGGER IF EXISTS trigger_device_site_assignment_lineage_update ON device_site_assignments;

CREATE TRIGGER trigger_device_site_assignment_lineage_update
  AFTER INSERT OR UPDATE OF is_active, site_id, program_id
  ON device_site_assignments
  FOR EACH ROW
  WHEN (NEW.is_active = TRUE)
  EXECUTE FUNCTION fn_trigger_device_lineage_update();

COMMENT ON FUNCTION fn_trigger_device_lineage_update() IS
'Trigger function that automatically initializes device lineage when device_site_assignments is created or updated with is_active=TRUE. Calls fn_initialize_device_after_mapping to populate all derived fields.';

-- ==========================================
-- HELPER: VALIDATE DEVICE PROVISIONING
-- ==========================================

CREATE OR REPLACE FUNCTION fn_validate_device_provisioning(p_device_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_device RECORD;
  v_site_assignment RECORD;
  v_program_assignment RECORD;
  v_issues TEXT[] := ARRAY[]::TEXT[];
  v_lineage JSONB;
BEGIN
  -- Get device
  SELECT * INTO v_device
  FROM devices
  WHERE device_id = p_device_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'device_not_found'
    );
  END IF;

  -- Check junction table consistency
  SELECT * INTO v_site_assignment
  FROM device_site_assignments
  WHERE device_id = p_device_id AND is_active = TRUE
  LIMIT 1;

  SELECT * INTO v_program_assignment
  FROM device_program_assignments
  WHERE device_id = p_device_id AND is_active = TRUE
  LIMIT 1;

  -- Validate site_id matches
  IF v_site_assignment.site_id IS NOT NULL AND v_device.site_id != v_site_assignment.site_id THEN
    v_issues := array_append(v_issues, 'site_id_mismatch_with_junction_table');
  END IF;

  -- Validate program_id matches
  IF v_program_assignment.program_id IS NOT NULL AND v_device.program_id != v_program_assignment.program_id THEN
    v_issues := array_append(v_issues, 'program_id_mismatch_with_junction_table');
  END IF;

  -- Validate provisioning_status
  IF v_device.site_id IS NOT NULL AND v_device.program_id IS NOT NULL THEN
    IF v_device.provisioning_status IN ('pending_mapping', 'mapped') THEN
      v_issues := array_append(v_issues, 'should_be_active_status');
    END IF;
  ELSIF v_device.provisioning_status = 'active' THEN
    v_issues := array_append(v_issues, 'active_status_without_mapping');
  END IF;

  -- Check lineage resolution
  v_lineage := fn_resolve_device_lineage(v_device.device_mac);
  IF v_lineage IS NULL THEN
    v_issues := array_append(v_issues, 'lineage_resolution_failed');
  ELSIF v_lineage ? 'error' THEN
    v_issues := array_append(v_issues, v_lineage->>'error');
  END IF;

  -- Return validation result
  RETURN jsonb_build_object(
    'valid', array_length(v_issues, 1) IS NULL OR array_length(v_issues, 1) = 0,
    'device_id', p_device_id,
    'device_mac', v_device.device_mac,
    'provisioning_status', v_device.provisioning_status,
    'site_id', v_device.site_id,
    'program_id', v_device.program_id,
    'company_id', v_device.company_id,
    'has_site_assignment', v_site_assignment.assignment_id IS NOT NULL,
    'has_program_assignment', v_program_assignment.assignment_id IS NOT NULL,
    'issues', COALESCE(v_issues, ARRAY[]::TEXT[]),
    'lineage', v_lineage
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'valid', false,
    'error', 'validation_exception',
    'message', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_validate_device_provisioning(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION fn_validate_device_provisioning(UUID) IS
'Validate device provisioning state. Checks junction table consistency, status transitions, and lineage resolution. Returns JSONB with validation results and list of issues.';

-- ==========================================
-- QUERY: FIND DEVICES NEEDING LINEAGE FIX
-- ==========================================

CREATE OR REPLACE FUNCTION fn_find_devices_with_incomplete_lineage()
RETURNS TABLE (
  device_id UUID,
  device_mac TEXT,
  device_name TEXT,
  provisioning_status TEXT,
  has_site_assignment BOOLEAN,
  has_program_assignment BOOLEAN,
  site_id_in_device UUID,
  site_id_in_assignment UUID,
  program_id_in_device UUID,
  program_id_in_assignment UUID,
  issue_description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.device_id,
    d.device_mac,
    d.device_name,
    d.provisioning_status,
    dsa.assignment_id IS NOT NULL as has_site_assignment,
    dpa.assignment_id IS NOT NULL as has_program_assignment,
    d.site_id as site_id_in_device,
    dsa.site_id as site_id_in_assignment,
    d.program_id as program_id_in_device,
    dpa.program_id as program_id_in_assignment,
    CASE
      WHEN dsa.site_id IS NOT NULL AND d.site_id IS NULL THEN 'Has site assignment but device.site_id is NULL'
      WHEN dsa.site_id IS NOT NULL AND d.site_id != dsa.site_id THEN 'site_id mismatch between device and assignment'
      WHEN dpa.program_id IS NOT NULL AND d.program_id IS NULL THEN 'Has program assignment but device.program_id is NULL'
      WHEN dpa.program_id IS NOT NULL AND d.program_id != dpa.program_id THEN 'program_id mismatch between device and assignment'
      WHEN d.site_id IS NOT NULL AND d.company_id IS NULL THEN 'Has site_id but company_id is NULL'
      WHEN d.site_id IS NOT NULL AND d.provisioning_status = 'pending_mapping' THEN 'Has site_id but still in pending_mapping status'
      ELSE 'Other inconsistency'
    END as issue_description
  FROM devices d
  LEFT JOIN device_site_assignments dsa ON d.device_id = dsa.device_id AND dsa.is_active = TRUE
  LEFT JOIN device_program_assignments dpa ON d.device_id = dpa.device_id AND dpa.is_active = TRUE
  WHERE
    -- Has active assignment but missing device fields
    (dsa.site_id IS NOT NULL AND d.site_id IS NULL)
    OR (dsa.site_id IS NOT NULL AND d.site_id != dsa.site_id)
    OR (dpa.program_id IS NOT NULL AND d.program_id IS NULL)
    OR (dpa.program_id IS NOT NULL AND d.program_id != dpa.program_id)
    OR (d.site_id IS NOT NULL AND d.company_id IS NULL)
    OR (d.site_id IS NOT NULL AND d.provisioning_status = 'pending_mapping')
  ORDER BY d.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION fn_find_devices_with_incomplete_lineage() TO authenticated, service_role;

COMMENT ON FUNCTION fn_find_devices_with_incomplete_lineage() IS
'Find devices with incomplete or inconsistent lineage. Returns devices that have junction table assignments but missing device table fields, or status inconsistencies. Used for maintenance and backfill operations.';
