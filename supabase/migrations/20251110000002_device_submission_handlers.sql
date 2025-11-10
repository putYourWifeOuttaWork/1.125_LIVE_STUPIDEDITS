/*
  # Device Submission System - Image Handlers

  1. Purpose
    - Handle image transmission lifecycle events
    - Maintain session counters and observation linkage
    - Support retry-by-ID with audit trails

  2. Functions
    - fn_image_completion_handler() - Handle successful image transmission
    - fn_image_failure_handler() - Handle failed image transmission
    - fn_retry_by_id_handler() - Process image retry requests
*/

-- ==========================================
-- FUNCTION 4: IMAGE COMPLETION HANDLER
-- ==========================================

CREATE OR REPLACE FUNCTION fn_image_completion_handler(
  p_image_id UUID,
  p_image_url TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_image_record RECORD;
  v_payload_record RECORD;
  v_observation_id UUID;
  v_slot_index INT;
BEGIN
  -- Get image details
  SELECT * INTO v_image_record
  FROM device_images
  WHERE image_id = p_image_id;

  IF v_image_record.image_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Image not found'
    );
  END IF;

  -- Step 1: Update device_images
  UPDATE device_images
  SET image_url = p_image_url,
      status = 'complete',
      received_at = NOW(),
      updated_at = NOW()
  WHERE image_id = p_image_id;

  -- Step 2: Get linked payload
  SELECT * INTO v_payload_record
  FROM device_wake_payloads
  WHERE image_id = p_image_id;

  IF v_payload_record.payload_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Payload not found for image'
    );
  END IF;

  -- Step 3: Update payload
  UPDATE device_wake_payloads
  SET image_status = 'complete',
      payload_status = 'complete',
      received_at = NOW()
  WHERE payload_id = v_payload_record.payload_id;

  -- Step 4: Determine slot mapping
  -- Priority: device-reported slot_index > wake_window_index
  v_slot_index := COALESCE(
    (v_image_record.metadata->>'slot_index')::INT,
    v_payload_record.wake_window_index,
    1
  );

  -- Step 5: Create petri_observation (device-generated)
  INSERT INTO petri_observations (
    site_id,
    program_id,
    company_id,
    image_url,
    order_index,
    is_device_generated,
    device_capture_metadata,
    created_at
  ) VALUES (
    v_payload_record.site_id,
    v_payload_record.program_id,
    v_payload_record.company_id,
    p_image_url,
    v_slot_index,
    TRUE,
    v_payload_record.telemetry_data,
    NOW()
  )
  RETURNING observation_id INTO v_observation_id;

  -- Step 6: Link observation back to image
  UPDATE device_images
  SET observation_id = v_observation_id,
      observation_type = 'petri'
  WHERE image_id = p_image_id;

  -- Step 7: Increment session completed counter
  UPDATE site_device_sessions
  SET completed_wake_count = completed_wake_count + 1
  WHERE session_id = v_payload_record.site_device_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'image_id', p_image_id,
    'observation_id', v_observation_id,
    'payload_id', v_payload_record.payload_id,
    'session_id', v_payload_record.site_device_session_id,
    'slot_index', v_slot_index
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_image_completion_handler(UUID, TEXT) IS 'Handle successful image transmission. Create observation, update counters, link records.';

-- ==========================================
-- FUNCTION 5: IMAGE FAILURE HANDLER
-- ==========================================

CREATE OR REPLACE FUNCTION fn_image_failure_handler(
  p_image_id UUID,
  p_error_code INT DEFAULT 0,
  p_error_message TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_image_record RECORD;
  v_payload_record RECORD;
  v_device_id UUID;
BEGIN
  -- Get image details
  SELECT * INTO v_image_record
  FROM device_images
  WHERE image_id = p_image_id;

  IF v_image_record.image_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Image not found'
    );
  END IF;

  v_device_id := v_image_record.device_id;

  -- Step 1: Mark image as failed
  UPDATE device_images
  SET status = 'failed',
      error_code = p_error_code,
      updated_at = NOW()
  WHERE image_id = p_image_id;

  -- Step 2: Get linked payload
  SELECT * INTO v_payload_record
  FROM device_wake_payloads
  WHERE image_id = p_image_id;

  IF v_payload_record.payload_id IS NOT NULL THEN
    -- Update payload
    UPDATE device_wake_payloads
    SET image_status = 'failed',
        payload_status = 'failed'
    WHERE payload_id = v_payload_record.payload_id;

    -- Step 3: Increment session failure counter
    UPDATE site_device_sessions
    SET failed_wake_count = failed_wake_count + 1
    WHERE session_id = v_payload_record.site_device_session_id;
  END IF;

  -- Step 4: Create alert
  INSERT INTO device_alerts (
    device_id,
    alert_type,
    severity,
    message,
    metadata,
    company_id
  )
  SELECT
    v_device_id,
    'image_transmission_failed',
    'error',
    COALESCE(p_error_message, 'Image transmission failed with error code ' || p_error_code),
    jsonb_build_object(
      'image_id', p_image_id,
      'image_name', v_image_record.image_name,
      'error_code', p_error_code,
      'captured_at', v_image_record.captured_at,
      'retry_count', v_image_record.retry_count
    ),
    v_image_record.company_id;

  RETURN jsonb_build_object(
    'success', true,
    'image_id', p_image_id,
    'device_id', v_device_id,
    'error_code', p_error_code,
    'alert_created', true
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_image_failure_handler(UUID, INT, TEXT) IS 'Handle failed image transmission. Mark failed, create alert, update counters.';

-- ==========================================
-- FUNCTION 6: RETRY-BY-ID HANDLER
-- ==========================================

CREATE OR REPLACE FUNCTION fn_retry_by_id_handler(
  p_device_id UUID,
  p_image_name TEXT,
  p_new_image_url TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_original_image_id UUID;
  v_original_captured_at TIMESTAMPTZ;
  v_original_capture_date DATE;
  v_payload_record RECORD;
  v_session_id UUID;
  v_observation_id UUID;
  v_was_failed BOOLEAN;
BEGIN
  -- Step 1: Locate original image by stable identifier
  SELECT image_id, captured_at, original_capture_date, status
  INTO v_original_image_id, v_original_captured_at, v_original_capture_date, v_was_failed
  FROM device_images
  WHERE device_id = p_device_id
    AND image_name = p_image_name
  ORDER BY captured_at DESC
  LIMIT 1;

  IF v_original_image_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Original image not found for device and image_name'
    );
  END IF;

  v_was_failed := (v_was_failed = 'failed');

  -- Step 2: Update existing image row (NEVER create duplicate)
  UPDATE device_images
  SET status = CASE
                 WHEN p_new_image_url IS NOT NULL THEN 'complete'
                 ELSE 'receiving'
               END,
      image_url = COALESCE(p_new_image_url, image_url),
      resent_received_at = NOW(),
      retry_count = retry_count + 1,
      updated_at = NOW()
      -- Keep captured_at unchanged! (preserves original timestamp)
  WHERE image_id = v_original_image_id;

  -- Step 3: Get linked payload (in original session)
  SELECT * INTO v_payload_record
  FROM device_wake_payloads
  WHERE image_id = v_original_image_id;

  IF v_payload_record.payload_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Payload not found for original image'
    );
  END IF;

  v_session_id := v_payload_record.site_device_session_id;

  -- Step 4: Update linked payload
  UPDATE device_wake_payloads
  SET image_status = CASE
                       WHEN p_new_image_url IS NOT NULL THEN 'complete'
                       ELSE 'receiving'
                     END,
      payload_status = CASE
                         WHEN p_new_image_url IS NOT NULL THEN 'complete'
                         ELSE 'pending'
                       END,
      resent_received_at = NOW()
      -- Telemetry anchoring: use original captured_at data (already stored)
  WHERE payload_id = v_payload_record.payload_id;

  -- Step 5: If image is now complete and was failed, recompute counters
  IF p_new_image_url IS NOT NULL AND v_was_failed THEN
    UPDATE site_device_sessions
    SET completed_wake_count = completed_wake_count + 1,
        failed_wake_count = GREATEST(failed_wake_count - 1, 0)
    WHERE session_id = v_session_id;

    -- Create observation if missing
    IF v_payload_record.site_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM petri_observations
         WHERE image_url = p_new_image_url
       ) THEN

      INSERT INTO petri_observations (
        site_id,
        program_id,
        company_id,
        image_url,
        order_index,
        is_device_generated,
        device_capture_metadata,
        created_at
      ) VALUES (
        v_payload_record.site_id,
        v_payload_record.program_id,
        v_payload_record.company_id,
        p_new_image_url,
        COALESCE(v_payload_record.wake_window_index, 1),
        TRUE,
        v_payload_record.telemetry_data,
        NOW()
      )
      RETURNING observation_id INTO v_observation_id;

      -- Link back to image
      UPDATE device_images
      SET observation_id = v_observation_id,
          observation_type = 'petri'
      WHERE image_id = v_original_image_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'image_id', v_original_image_id,
    'was_failed', v_was_failed,
    'is_complete', (p_new_image_url IS NOT NULL),
    'retry_count', (SELECT retry_count FROM device_images WHERE image_id = v_original_image_id),
    'session_id', v_session_id,
    'original_captured_at', v_original_captured_at,
    'resent_received_at', NOW()
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_retry_by_id_handler(UUID, TEXT, TEXT) IS 'Process image retry. Updates same row (never duplicate), recomputes counters for original session, preserves original telemetry.';

-- ==========================================
-- HELPER: BULK SESSION OPENER FOR ALL SITES
-- ==========================================

CREATE OR REPLACE FUNCTION fn_midnight_session_opener_all()
RETURNS JSONB AS $$
DECLARE
  v_site_record RECORD;
  v_success_count INT := 0;
  v_error_count INT := 0;
  v_result JSONB;
  v_results JSONB[] := '{}';
BEGIN
  -- Loop through all active sites in active programs
  FOR v_site_record IN
    SELECT DISTINCT s.site_id, s.site_name
    FROM sites s
    JOIN pilot_programs p ON s.program_id = p.program_id
    WHERE p.status = 'active'
  LOOP
    BEGIN
      v_result := fn_midnight_session_opener(v_site_record.site_id);

      IF (v_result->>'success')::BOOLEAN THEN
        v_success_count := v_success_count + 1;
      ELSE
        v_error_count := v_error_count + 1;
      END IF;

      v_results := array_append(v_results, v_result);

    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      v_results := array_append(v_results, jsonb_build_object(
        'success', false,
        'site_id', v_site_record.site_id,
        'site_name', v_site_record.site_name,
        'message', SQLERRM
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed_sites', v_success_count + v_error_count,
    'success_count', v_success_count,
    'error_count', v_error_count,
    'results', to_jsonb(v_results)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_midnight_session_opener_all() IS 'Bulk session opener for all active sites. Call from pg_cron at midnight.';

-- ==========================================
-- HELPER: BULK SESSION LOCKER FOR ALL SITES
-- ==========================================

CREATE OR REPLACE FUNCTION fn_end_of_day_locker_all()
RETURNS JSONB AS $$
DECLARE
  v_site_record RECORD;
  v_success_count INT := 0;
  v_error_count INT := 0;
  v_total_alerts INT := 0;
  v_result JSONB;
  v_results JSONB[] := '{}';
BEGIN
  -- Loop through all sites with unlocked sessions today
  FOR v_site_record IN
    SELECT DISTINCT sds.site_id, s.site_name
    FROM site_device_sessions sds
    JOIN sites s ON sds.site_id = s.site_id
    WHERE sds.session_date = CURRENT_DATE
      AND sds.status != 'locked'
  LOOP
    BEGIN
      v_result := fn_end_of_day_locker(v_site_record.site_id);

      IF (v_result->>'success')::BOOLEAN THEN
        v_success_count := v_success_count + 1;
        v_total_alerts := v_total_alerts + COALESCE((v_result->>'alerts_created')::INT, 0);
      ELSE
        v_error_count := v_error_count + 1;
      END IF;

      v_results := array_append(v_results, v_result);

    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      v_results := array_append(v_results, jsonb_build_object(
        'success', false,
        'site_id', v_site_record.site_id,
        'site_name', v_site_record.site_name,
        'message', SQLERRM
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed_sites', v_success_count + v_error_count,
    'success_count', v_success_count,
    'error_count', v_error_count,
    'total_alerts_created', v_total_alerts,
    'results', to_jsonb(v_results)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_end_of_day_locker_all() IS 'Bulk session locker for all sites. Call from pg_cron at end of day.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_image_completion_handler(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_image_failure_handler(UUID, INT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_retry_by_id_handler(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_midnight_session_opener_all() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_end_of_day_locker_all() TO authenticated, service_role;
