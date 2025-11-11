/*
  # Device ACK Log Table

  1. Purpose
    - Audit trail for all MQTT acknowledgments sent to devices
    - Track ACK_OK messages with next wake times
    - Track missing chunk requests for retry debugging
    - Monitor MQTT communication success/failure

  2. New Table
    - `device_ack_log` - Complete log of device acknowledgments

  3. Use Cases
    - Debugging device communication issues
    - Verifying devices receive wake schedules
    - Tracking retry patterns
    - Analytics on device behavior

  4. Security
    - RLS enabled with company-scoped access
    - Authenticated users can view ACKs for their company devices
*/

-- ==========================================
-- TABLE: DEVICE_ACK_LOG
-- ==========================================

CREATE TABLE IF NOT EXISTS device_ack_log (
  ack_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Device reference
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  device_mac TEXT NOT NULL,

  -- Image reference
  image_name TEXT NOT NULL,
  image_id UUID REFERENCES device_images(image_id) ON DELETE SET NULL,

  -- ACK type and content
  ack_type TEXT NOT NULL CHECK (ack_type IN ('ACK_OK', 'MISSING_CHUNKS', 'RETRY_COMMAND')),

  -- ACK_OK specific fields
  next_wake_time TIMESTAMPTZ,

  -- MISSING_CHUNKS specific fields
  missing_chunks INT[],
  missing_count INT,

  -- MQTT details
  mqtt_topic TEXT NOT NULL,
  mqtt_payload JSONB NOT NULL,
  mqtt_success BOOLEAN DEFAULT TRUE,
  mqtt_error TEXT,

  -- Timing
  published_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for performance and querying
CREATE INDEX IF NOT EXISTS idx_device_ack_log_device ON device_ack_log(device_id);
CREATE INDEX IF NOT EXISTS idx_device_ack_log_device_mac ON device_ack_log(device_mac);
CREATE INDEX IF NOT EXISTS idx_device_ack_log_image ON device_ack_log(image_id) WHERE image_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_ack_log_type ON device_ack_log(ack_type);
CREATE INDEX IF NOT EXISTS idx_device_ack_log_published ON device_ack_log(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_ack_log_device_published ON device_ack_log(device_id, published_at DESC);

-- GIN index for JSONB payload queries
CREATE INDEX IF NOT EXISTS idx_device_ack_log_payload ON device_ack_log USING GIN (mqtt_payload);

-- RLS
ALTER TABLE device_ack_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see ACK logs for devices in their company"
  ON device_ack_log FOR SELECT TO authenticated
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

-- Service role can insert and manage all ACK logs
CREATE POLICY "Service role can manage ACK logs"
  ON device_ack_log FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE device_ack_log IS 'Audit trail of all MQTT acknowledgments sent to devices. Tracks ACK_OK, missing chunks requests, and retry commands.';
COMMENT ON COLUMN device_ack_log.ack_type IS 'Type of acknowledgment: ACK_OK (success), MISSING_CHUNKS (retry needed), RETRY_COMMAND (resend request)';
COMMENT ON COLUMN device_ack_log.next_wake_time IS 'Next scheduled wake time sent to device (ACK_OK only)';
COMMENT ON COLUMN device_ack_log.missing_chunks IS 'Array of missing chunk IDs (MISSING_CHUNKS only)';
COMMENT ON COLUMN device_ack_log.mqtt_success IS 'Whether MQTT publish succeeded';
COMMENT ON COLUMN device_ack_log.mqtt_payload IS 'Complete MQTT message payload for audit';

-- ==========================================
-- HELPER: LOG ACK FUNCTION
-- ==========================================

CREATE OR REPLACE FUNCTION fn_log_device_ack(
  p_device_mac TEXT,
  p_image_name TEXT,
  p_ack_type TEXT,
  p_mqtt_topic TEXT,
  p_mqtt_payload JSONB,
  p_next_wake_time TIMESTAMPTZ DEFAULT NULL,
  p_missing_chunks INT[] DEFAULT NULL,
  p_mqtt_success BOOLEAN DEFAULT TRUE,
  p_mqtt_error TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_device_id UUID;
  v_image_id UUID;
  v_ack_id UUID;
BEGIN
  -- Resolve device MAC to UUID
  SELECT device_id INTO v_device_id
  FROM devices
  WHERE device_mac = p_device_mac
  LIMIT 1;

  IF v_device_id IS NULL THEN
    RAISE WARNING 'fn_log_device_ack: Device not found for MAC %', p_device_mac;
    RETURN NULL;
  END IF;

  -- Try to find image_id
  SELECT image_id INTO v_image_id
  FROM device_images
  WHERE device_id = v_device_id
    AND image_name = p_image_name
  ORDER BY created_at DESC
  LIMIT 1;

  -- Insert ACK log
  INSERT INTO device_ack_log (
    device_id,
    device_mac,
    image_name,
    image_id,
    ack_type,
    mqtt_topic,
    mqtt_payload,
    next_wake_time,
    missing_chunks,
    missing_count,
    mqtt_success,
    mqtt_error
  )
  VALUES (
    v_device_id,
    p_device_mac,
    p_image_name,
    v_image_id,
    p_ack_type,
    p_mqtt_topic,
    p_mqtt_payload,
    p_next_wake_time,
    p_missing_chunks,
    COALESCE(array_length(p_missing_chunks, 1), 0),
    p_mqtt_success,
    p_mqtt_error
  )
  RETURNING ack_id INTO v_ack_id;

  RETURN v_ack_id;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_log_device_ack error: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_log_device_ack TO service_role;

COMMENT ON FUNCTION fn_log_device_ack IS
'Log device ACK to audit trail. Called by edge function after publishing MQTT message. Returns ack_id or NULL on error.';
