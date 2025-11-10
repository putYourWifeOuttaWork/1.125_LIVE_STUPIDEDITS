/*
  # Update Retry Handler - Phase 2.5

  1. Purpose
    - Fix retry-by-ID handler to use device_submission_id for petri observations
    - Ensure retried images don't violate submission_id NOT NULL constraint
    - Preserve original timestamps and session context

  2. Changes
    - fn_retry_by_id_handler: Fetch device_submission_id from original session
    - Create petri observations with valid submission_id
    - Maintain telemetry authority (use original captured_at data)
*/

-- ==========================================
-- UPDATE: RETRY-BY-ID HANDLER
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
  v_session_record RECORD;
  v_observation_id UUID;
  v_was_failed BOOLEAN;
  v_device_submission_id UUID;
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

  -- Step 4: Get original session and device_submission_id
  SELECT * INTO v_session_record
  FROM site_device_sessions
  WHERE session_id = v_payload_record.site_device_session_id;

  IF v_session_record.session_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Session not found for payload'
    );
  END IF;

  -- Get device_submission_id (fallback: create on-demand if missing)
  v_device_submission_id := v_session_record.device_submission_id;

  IF v_device_submission_id IS NULL THEN
    -- Fallback: create device submission shell for original date
    v_device_submission_id := fn_get_or_create_device_submission(
      v_payload_record.site_id,
      v_session_record.session_date
    );

    -- Update session with device_submission_id
    UPDATE site_device_sessions
    SET device_submission_id = v_device_submission_id
    WHERE session_id = v_session_record.session_id;
  END IF;

  -- Step 5: Update linked payload
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

  -- Step 6: If image is now complete and was failed, recompute counters
  IF p_new_image_url IS NOT NULL AND v_was_failed THEN
    UPDATE site_device_sessions
    SET completed_wake_count = completed_wake_count + 1,
        failed_wake_count = GREATEST(failed_wake_count - 1, 0)
    WHERE session_id = v_session_record.session_id;

    -- Create observation if missing (now with submission_id)
    IF v_payload_record.site_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM petri_observations
         WHERE image_url = p_new_image_url
       ) THEN

      INSERT INTO petri_observations (
        submission_id,          -- CRITICAL: Now includes submission_id
        site_id,
        program_id,
        company_id,
        image_url,
        order_index,
        is_device_generated,
        device_capture_metadata,
        created_at
      ) VALUES (
        v_device_submission_id, -- Use original session's device submission
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
    'session_id', v_session_record.session_id,
    'device_submission_id', v_device_submission_id,
    'original_captured_at', v_original_captured_at,
    'resent_at', NOW(),
    'observation_created', v_observation_id IS NOT NULL
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM,
    'error_detail', SQLSTATE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_retry_by_id_handler(UUID, TEXT, TEXT) IS 'Process image retry requests. Update same rows (no duplicates), preserve original timestamps, use original session device_submission_id for observations.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_retry_by_id_handler(UUID, TEXT, TEXT) TO authenticated, service_role;
