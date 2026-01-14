/*
  # Support Firmware-Managed Image Resume

  ## Overview
  Enables devices to resume interrupted image transfers across multiple wake sessions.
  Server detects partial images and continues assembly without creating duplicates.

  ## Changes

  1. Constraints
     - Add UNIQUE constraint on device_images(device_id, image_name)
     - Prevents duplicate image records for same device+image combination

  2. New Tables
     - `duplicate_images_log` - Tracks when complete images receive duplicate metadata

  3. Indexes
     - Fast lookup for resume detection
     - Efficient queries for incomplete images

  4. Functions
     - Update fn_wake_ingestion_handler to support resume
     - Create fn_check_image_resumable helper
     - Create fn_log_duplicate_image for audit

  5. Views
     - incomplete_images_report for monitoring failed transfers

  ## Resume Flow
  1. Device sends metadata for image (may be resume or new)
  2. Server checks if (device_id, image_name) exists
  3. If incomplete: Update metadata, continue adding chunks
  4. If complete: Log duplicate, ignore gracefully
  5. If new: Create record, start fresh
  6. Chunks append with deduplication
  7. Assembly triggers when chunk count reaches total
*/

-- ==========================================
-- STEP 1: ADD UNIQUE CONSTRAINT TO DEVICE_IMAGES
-- ==========================================

-- First check if constraint already exists
DO $$
BEGIN
  -- Add unique constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'device_images_device_id_image_name_key'
  ) THEN
    ALTER TABLE device_images
    ADD CONSTRAINT device_images_device_id_image_name_key
    UNIQUE (device_id, image_name);

    RAISE NOTICE 'Added UNIQUE constraint on device_images(device_id, image_name)';
  END IF;
END $$;

-- Add index for fast resume detection
CREATE INDEX IF NOT EXISTS idx_device_images_resume
ON device_images(device_id, image_name, status);

-- Add index for incomplete image queries
CREATE INDEX IF NOT EXISTS idx_device_images_incomplete
ON device_images(device_id, status)
WHERE status IN ('pending', 'receiving');

COMMENT ON INDEX idx_device_images_resume IS
'Fast lookup for image resume detection by device, name, and status';

-- ==========================================
-- STEP 2: CREATE DUPLICATE IMAGES LOG TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS duplicate_images_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  image_id UUID REFERENCES device_images(image_id) ON DELETE SET NULL,

  -- Image identification
  image_name TEXT NOT NULL,

  -- Timestamps
  original_captured_at TIMESTAMPTZ,
  duplicate_received_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Full metadata for debugging
  duplicate_metadata JSONB NOT NULL,

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for querying duplicates
CREATE INDEX IF NOT EXISTS idx_duplicate_images_device
ON duplicate_images_log(device_id, duplicate_received_at DESC);

CREATE INDEX IF NOT EXISTS idx_duplicate_images_image
ON duplicate_images_log(image_id) WHERE image_id IS NOT NULL;

-- RLS
ALTER TABLE duplicate_images_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see duplicate logs for devices in their company"
  ON duplicate_images_log FOR SELECT TO authenticated
  USING (
    device_id IN (
      SELECT d.device_id
      FROM devices d
      JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
      JOIN sites s ON dsa.site_id = s.site_id
      JOIN pilot_programs p ON s.program_id = p.program_id
      WHERE p.company_id = get_active_company_id()
        AND dsa.is_active = TRUE
    )
  );

CREATE POLICY "Service role can manage duplicate logs"
  ON duplicate_images_log FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE duplicate_images_log IS
'Audit log of duplicate metadata received for already-complete images. Used for firmware debugging and analytics.';

-- ==========================================
-- STEP 3: HELPER FUNCTION - CHECK IMAGE RESUMABLE
-- ==========================================

CREATE OR REPLACE FUNCTION fn_check_image_resumable(
  p_device_id UUID,
  p_image_name TEXT
)
RETURNS TABLE (
  image_id UUID,
  status TEXT,
  received_chunks INT,
  total_chunks INT,
  is_resumable BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    di.image_id,
    di.status,
    di.received_chunks,
    di.total_chunks,
    (di.status IN ('pending', 'receiving')) AS is_resumable
  FROM device_images di
  WHERE di.device_id = p_device_id
    AND di.image_name = p_image_name
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_check_image_resumable TO service_role;

COMMENT ON FUNCTION fn_check_image_resumable IS
'Check if an image exists and can be resumed. Returns image details and resumable flag. Used by both mqtt-service and edge function.';

-- ==========================================
-- STEP 4: HELPER FUNCTION - LOG DUPLICATE IMAGE
-- ==========================================

CREATE OR REPLACE FUNCTION fn_log_duplicate_image(
  p_device_id UUID,
  p_image_name TEXT,
  p_duplicate_metadata JSONB
)
RETURNS UUID AS $$
DECLARE
  v_image_id UUID;
  v_original_captured_at TIMESTAMPTZ;
  v_log_id UUID;
BEGIN
  -- Get existing image details
  SELECT image_id, captured_at
  INTO v_image_id, v_original_captured_at
  FROM device_images
  WHERE device_id = p_device_id
    AND image_name = p_image_name
    AND status = 'complete'
  LIMIT 1;

  -- Insert duplicate log
  INSERT INTO duplicate_images_log (
    device_id,
    image_id,
    image_name,
    original_captured_at,
    duplicate_metadata
  )
  VALUES (
    p_device_id,
    v_image_id,
    p_image_name,
    v_original_captured_at,
    p_duplicate_metadata
  )
  RETURNING log_id INTO v_log_id;

  RETURN v_log_id;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_log_duplicate_image error: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_log_duplicate_image TO service_role;

COMMENT ON FUNCTION fn_log_duplicate_image IS
'Log when duplicate metadata is received for an already-complete image. Returns log_id or NULL on error.';

-- ==========================================
-- STEP 5: UPDATE WAKE INGESTION HANDLER
-- ==========================================

CREATE OR REPLACE FUNCTION fn_wake_ingestion_handler(
  p_device_id UUID,
  p_captured_at TIMESTAMPTZ,
  p_image_name TEXT,
  p_telemetry_data JSONB,
  p_existing_image_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_payload_id UUID;
  v_image_id UUID;
  v_session_id UUID;
  v_wake_index INT;
  v_company_id UUID;
  v_program_id UUID;
  v_site_id UUID;
BEGIN
  -- Resolve device lineage
  SELECT company_id, program_id, site_id
  INTO v_company_id, v_program_id, v_site_id
  FROM devices
  WHERE device_id = p_device_id;

  -- Find active session for this site (if mapped)
  IF v_site_id IS NOT NULL THEN
    SELECT session_id INTO v_session_id
    FROM site_device_sessions
    WHERE site_id = v_site_id
      AND status IN ('pending', 'in_progress')
      AND session_date = CURRENT_DATE
    ORDER BY session_start_time DESC
    LIMIT 1;
  END IF;

  -- Use existing image_id if provided (resume case)
  IF p_existing_image_id IS NOT NULL THEN
    v_image_id := p_existing_image_id;

    -- Update existing image metadata (don't reset received_chunks)
    UPDATE device_images
    SET
      captured_at = p_captured_at,
      image_size = COALESCE((p_telemetry_data->>'image_size')::INT, image_size),
      total_chunks = COALESCE((p_telemetry_data->>'total_chunks')::INT, total_chunks),
      status = 'receiving',
      metadata = COALESCE(p_telemetry_data, metadata),
      updated_at = NOW()
    WHERE image_id = v_image_id;

  ELSE
    -- Create new image record
    INSERT INTO device_images (
      device_id,
      company_id,
      program_id,
      site_id,
      image_name,
      image_size,
      captured_at,
      total_chunks,
      received_chunks,
      status,
      metadata
    )
    VALUES (
      p_device_id,
      v_company_id,
      v_program_id,
      v_site_id,
      p_image_name,
      COALESCE((p_telemetry_data->>'image_size')::INT, 0),
      p_captured_at,
      COALESCE((p_telemetry_data->>'total_chunks')::INT, 0),
      0,
      'receiving',
      p_telemetry_data
    )
    RETURNING image_id INTO v_image_id;
  END IF;

  -- Always create new wake_payload (tracks each wake event)
  INSERT INTO device_wake_payloads (
    device_id,
    company_id,
    program_id,
    site_id,
    site_device_session_id,
    captured_at,
    received_at,
    temperature,
    humidity,
    pressure,
    gas_resistance,
    telemetry_data,
    wake_type,
    protocol_state,
    image_id
  )
  VALUES (
    p_device_id,
    v_company_id,
    v_program_id,
    v_site_id,
    v_session_id,
    p_captured_at,
    NOW(),
    (p_telemetry_data->>'temperature')::NUMERIC,
    (p_telemetry_data->>'humidity')::NUMERIC,
    (p_telemetry_data->>'pressure')::NUMERIC,
    (p_telemetry_data->>'gas_resistance')::NUMERIC,
    p_telemetry_data,
    'image_wake',
    CASE WHEN p_existing_image_id IS NOT NULL THEN 'metadata_received_resume' ELSE 'metadata_received' END,
    v_image_id
  )
  RETURNING payload_id INTO v_payload_id;

  -- Get wake index (count of wakes for this session)
  SELECT COUNT(*) INTO v_wake_index
  FROM device_wake_payloads
  WHERE site_device_session_id = v_session_id
    AND device_id = p_device_id;

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'payload_id', v_payload_id,
    'image_id', v_image_id,
    'session_id', v_session_id,
    'wake_index', v_wake_index,
    'is_resume', (p_existing_image_id IS NOT NULL)
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'message', 'Wake ingestion failed'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_wake_ingestion_handler IS
'Handle wake event ingestion with support for resuming incomplete images. If p_existing_image_id provided, updates existing image instead of creating new.';

-- ==========================================
-- STEP 6: VIEW FOR INCOMPLETE IMAGES REPORT
-- ==========================================

CREATE OR REPLACE VIEW incomplete_images_report AS
SELECT
  d.device_code,
  d.device_mac,
  d.device_name,
  di.image_id,
  di.image_name,
  di.status,
  di.received_chunks,
  di.total_chunks,
  ROUND((di.received_chunks::NUMERIC / NULLIF(di.total_chunks, 0) * 100), 2) AS completion_percentage,
  di.captured_at,
  di.updated_at,
  NOW() - di.updated_at AS time_since_update,
  -- Last wake payload attempt
  (
    SELECT wp.payload_id
    FROM device_wake_payloads wp
    WHERE wp.image_id = di.image_id
    ORDER BY wp.captured_at DESC
    LIMIT 1
  ) AS last_wake_payload_id,
  -- Company context
  c.company_name,
  s.site_name,
  p.program_name
FROM device_images di
JOIN devices d ON di.device_id = d.device_id
LEFT JOIN companies c ON di.company_id = c.company_id
LEFT JOIN sites s ON di.site_id = s.site_id
LEFT JOIN pilot_programs p ON di.program_id = p.program_id
WHERE di.status IN ('pending', 'receiving', 'failed')
ORDER BY di.updated_at DESC;

COMMENT ON VIEW incomplete_images_report IS
'Report of all incomplete or failed image transfers for monitoring and troubleshooting';

-- Grant access to view
GRANT SELECT ON incomplete_images_report TO authenticated;
GRANT SELECT ON incomplete_images_report TO service_role;

-- ==========================================
-- STEP 7: CLEANUP AND MAINTENANCE
-- ==========================================

-- Add comments explaining the resume system
COMMENT ON COLUMN device_images.image_name IS
'Unique image identifier per device. Combined with device_id forms unique key for resume detection. Format typically: macAddress_timestamp.jpg';

COMMENT ON COLUMN device_images.received_chunks IS
'Count of chunks received. Never reset to 0 on resume - increments as new chunks arrive across multiple sessions.';

COMMENT ON COLUMN device_images.status IS
'Image transfer status: pending (metadata not received), receiving (partial chunks), complete (uploaded), failed (timeout/error). Resume continues from receiving status.';

-- ==========================================
-- VERIFICATION QUERIES
-- ==========================================

-- Summary
DO $$
DECLARE
  v_incomplete_count INT;
  v_duplicate_count INT;
BEGIN
  SELECT COUNT(*) INTO v_incomplete_count
  FROM device_images
  WHERE status IN ('pending', 'receiving');

  SELECT COUNT(*) INTO v_duplicate_count
  FROM duplicate_images_log;

  RAISE NOTICE '';
  RAISE NOTICE '=== Image Resume Migration Complete ===';
  RAISE NOTICE 'Incomplete images in database: %', v_incomplete_count;
  RAISE NOTICE 'Duplicate logs recorded: %', v_duplicate_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Resume system is now active!';
  RAISE NOTICE 'Devices can resume interrupted transfers across multiple wake sessions.';
END $$;
