/*
  # MQTT Protocol Compliance & Message Logging System
  # APPLY THIS MIGRATION TO YOUR DATABASE

  ## Overview
  This migration implements complete ESP32-CAM MQTT protocol compliance per BrainlyTree specification.

  ## TO APPLY:
  Copy this entire SQL file and run it in your Supabase SQL Editor.

  ## Changes

  ### 1. MQTT Message Logging
  - `mqtt_messages` table: Comprehensive logging of all MQTT traffic
  - Tracks direction, topic, payload, timestamps
  - Essential for debugging and protocol compliance verification

  ### 2. Firmware Version Tracking
  - Add `firmware_version` to devices table
  - Track protocol compatibility

  ### 3. Protocol Field Mapping Support
  - Document exact field names required by firmware
  - Separate database schema from protocol requirements

  ## Security
  - RLS enabled on mqtt_messages table
  - Company-based access control

  ## Notes
  - Field names in MQTT must match firmware exactly (case-sensitive)
  - Database field names can differ for internal use
  - Protocol spec: BrainlyTree ESP32CAM Architecture Document
*/

-- =====================================================
-- MQTT MESSAGE LOGGING TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Message identification
  device_id uuid REFERENCES devices(device_id) ON DELETE CASCADE,
  mac_address text NOT NULL,

  -- Message routing
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  topic text NOT NULL,

  -- Payload
  payload jsonb NOT NULL,
  payload_size int,

  -- Message classification
  message_type text NOT NULL CHECK (message_type IN (
    'hello',           -- Device status/alive message
    'capture_image',   -- Server command to capture
    'send_image',      -- Server command to transmit
    'next_wake',       -- Server command for wake schedule
    'metadata',        -- Device sends image metadata
    'chunk',           -- Device sends image chunk
    'ack_ok',          -- Server acknowledges completion
    'missing_chunks',  -- Server requests retry
    'ping',            -- Server ping command
    'telemetry',       -- Device telemetry data
    'other'
  )),

  -- Context
  session_id uuid REFERENCES site_device_sessions(session_id) ON DELETE SET NULL,
  wake_payload_id uuid REFERENCES device_wake_payloads(payload_id) ON DELETE SET NULL,
  image_name text,
  chunk_id int,

  -- Metadata
  company_id uuid REFERENCES companies(company_id) ON DELETE CASCADE NOT NULL,
  site_id uuid REFERENCES sites(site_id) ON DELETE SET NULL,
  pilot_program_id uuid REFERENCES pilot_programs(program_id) ON DELETE SET NULL,

  -- Protocol compliance tracking
  protocol_version text DEFAULT '1.0',
  firmware_version text,

  -- Error tracking
  error_message text,
  retry_count int DEFAULT 0
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mqtt_messages_device_id ON mqtt_messages(device_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_messages_created_at ON mqtt_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mqtt_messages_mac_address ON mqtt_messages(mac_address);
CREATE INDEX IF NOT EXISTS idx_mqtt_messages_message_type ON mqtt_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_mqtt_messages_session_id ON mqtt_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_messages_wake_payload_id ON mqtt_messages(wake_payload_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_messages_company_id ON mqtt_messages(company_id);

-- Enable RLS
ALTER TABLE mqtt_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view mqtt_messages for their company"
  ON mqtt_messages FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM users
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "System can insert mqtt_messages"
  ON mqtt_messages FOR INSERT
  TO service_role
  WITH CHECK (true);

-- =====================================================
-- FIRMWARE VERSION TRACKING
-- =====================================================

-- Add firmware version to devices table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'firmware_version'
  ) THEN
    ALTER TABLE devices ADD COLUMN firmware_version text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'protocol_version'
  ) THEN
    ALTER TABLE devices ADD COLUMN protocol_version text DEFAULT '1.0';
  END IF;
END $$;

-- =====================================================
-- PROTOCOL FIELD MAPPING REFERENCE TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS mqtt_protocol_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,

  -- Field mapping
  mqtt_field_name text NOT NULL,
  database_field_name text,
  data_type text NOT NULL,

  -- Context
  message_type text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('device_to_server', 'server_to_device', 'both')),

  -- Documentation
  description text,
  example_value text,
  required boolean DEFAULT false,

  -- Validation
  validation_rule text,

  CONSTRAINT unique_mqtt_field_per_message UNIQUE (mqtt_field_name, message_type, direction)
);

-- Populate protocol field mappings based on BrainlyTree spec
INSERT INTO mqtt_protocol_fields (mqtt_field_name, database_field_name, data_type, message_type, direction, description, required, example_value) VALUES
  -- HELLO message (device -> server)
  ('device_id', 'mac_address', 'text', 'hello', 'device_to_server', 'Device MAC address identifier', true, 'esp32-cam-01'),
  ('status', null, 'text', 'hello', 'device_to_server', 'Device status indicator', true, 'alive'),
  ('pendingImg', 'pending_image_count', 'integer', 'hello', 'device_to_server', 'Count of pending images on SD card', true, '1'),

  -- CAPTURE_IMAGE command (server -> device)
  ('device_id', 'mac_address', 'text', 'capture_image', 'server_to_device', 'Target device MAC address', true, 'esp32-cam-01'),
  ('capture_image', null, 'boolean', 'capture_image', 'server_to_device', 'Command flag to capture image', true, 'true'),

  -- SEND_IMAGE command (server -> device)
  ('device_id', 'mac_address', 'text', 'send_image', 'server_to_device', 'Target device MAC address', true, 'esp32-cam-01'),
  ('send_image', 'image_name', 'text', 'send_image', 'server_to_device', 'Name of image to transmit', true, 'image_001.jpg'),

  -- NEXT_WAKE command (server -> device)
  ('device_id', 'mac_address', 'text', 'next_wake', 'server_to_device', 'Target device MAC address', true, 'esp32-cam-01'),
  ('next_wake', 'next_wake_time', 'text', 'next_wake', 'server_to_device', 'Wake time in formatted string', true, '5:30PM'),

  -- METADATA message (device -> server)
  ('device_id', 'mac_address', 'text', 'metadata', 'device_to_server', 'Device MAC address', true, 'esp32-cam-01'),
  ('capture_timestamp', 'captured_at', 'timestamptz', 'metadata', 'device_to_server', 'ISO timestamp of image capture', true, '2025-08-29T14:30:00Z'),
  ('image_name', 'image_name', 'text', 'metadata', 'device_to_server', 'Unique image filename', true, 'image_001.jpg'),
  ('image_size', 'image_size_bytes', 'integer', 'metadata', 'device_to_server', 'Total image size in bytes', true, '4153'),
  ('max_chunk_size', 'chunk_size', 'integer', 'metadata', 'device_to_server', 'Size of each chunk in bytes', true, '128'),
  ('total_chunks_count', 'total_chunks', 'integer', 'metadata', 'device_to_server', 'Total number of chunks', true, '15'),
  ('location', 'location', 'text', 'metadata', 'device_to_server', 'Device location', false, 'Room 101'),
  ('error', 'error_code', 'integer', 'metadata', 'device_to_server', 'Error code (0 = success)', true, '0'),
  ('temperature', 'temperature', 'numeric', 'metadata', 'device_to_server', 'Temperature in Celsius', false, '25.5'),
  ('humidity', 'humidity', 'numeric', 'metadata', 'device_to_server', 'Humidity percentage', false, '45.2'),
  ('pressure', 'pressure', 'numeric', 'metadata', 'device_to_server', 'Atmospheric pressure', false, '1010.5'),
  ('gas_resistance', 'gas_resistance', 'numeric', 'metadata', 'device_to_server', 'Gas sensor resistance', false, '15.3'),

  -- CHUNK message (device -> server)
  ('device_id', 'mac_address', 'text', 'chunk', 'device_to_server', 'Device MAC address', true, 'esp32-cam-01'),
  ('image_name', 'image_name', 'text', 'chunk', 'device_to_server', 'Image filename', true, 'image_001.jpg'),
  ('chunk_id', 'chunk_number', 'integer', 'chunk', 'device_to_server', 'Sequential chunk number', true, '1'),
  ('max_chunk_size', 'chunk_size', 'integer', 'chunk', 'device_to_server', 'Size of chunk data', true, '30'),
  ('payload', 'chunk_data', 'bytea', 'chunk', 'device_to_server', 'Base64 encoded chunk data', true, '{0xFF, 0xD8, ...}'),

  -- ACK_OK message (server -> device)
  ('device_id', 'mac_address', 'text', 'ack_ok', 'server_to_device', 'Target device MAC address', true, 'esp32-cam-01'),
  ('image_name', 'image_name', 'text', 'ack_ok', 'server_to_device', 'Acknowledged image name', true, 'image_001.jpg'),
  ('ACK_OK', null, 'jsonb', 'ack_ok', 'server_to_device', 'Acknowledgment object', true, '{"next_wake_time": "5:30PM"}'),
  ('next_wake_time', 'next_wake_time', 'text', 'ack_ok', 'server_to_device', 'Next wake schedule (inside ACK_OK)', true, '5:30PM'),

  -- MISSING_CHUNKS message (server -> device)
  ('device_id', 'mac_address', 'text', 'missing_chunks', 'server_to_device', 'Target device MAC address', true, 'esp32-cam-01'),
  ('image_name', 'image_name', 'text', 'missing_chunks', 'server_to_device', 'Image with missing chunks', true, 'image_001.jpg'),
  ('missing_chunks', 'missing_chunk_ids', 'integer[]', 'missing_chunks', 'server_to_device', 'Array of missing chunk IDs', true, '{5,10,23}')
ON CONFLICT (mqtt_field_name, message_type, direction) DO NOTHING;

-- Enable RLS on protocol fields (read-only reference data)
ALTER TABLE mqtt_protocol_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read protocol fields"
  ON mqtt_protocol_fields FOR SELECT
  TO authenticated
  USING (true);

-- =====================================================
-- HELPER FUNCTIONS FOR PROTOCOL COMPLIANCE
-- =====================================================

-- Function to log MQTT messages
CREATE OR REPLACE FUNCTION log_mqtt_message(
  p_mac_address text,
  p_direction text,
  p_topic text,
  p_payload jsonb,
  p_message_type text,
  p_session_id uuid DEFAULT NULL,
  p_wake_payload_id uuid DEFAULT NULL,
  p_image_name text DEFAULT NULL,
  p_chunk_id int DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_device_id uuid;
  v_company_id uuid;
  v_site_id uuid;
  v_pilot_program_id uuid;
  v_message_id uuid;
  v_firmware_version text;
BEGIN
  -- Resolve device context
  SELECT id, company_id, site_id, pilot_program_id, firmware_version
  INTO v_device_id, v_company_id, v_site_id, v_pilot_program_id, v_firmware_version
  FROM devices
  WHERE mac_address = p_mac_address;

  -- Insert message log
  INSERT INTO mqtt_messages (
    device_id,
    mac_address,
    direction,
    topic,
    payload,
    payload_size,
    message_type,
    session_id,
    wake_payload_id,
    image_name,
    chunk_id,
    company_id,
    site_id,
    pilot_program_id,
    firmware_version
  ) VALUES (
    v_device_id,
    p_mac_address,
    p_direction,
    p_topic,
    p_payload,
    length(p_payload::text),
    p_message_type,
    p_session_id,
    p_wake_payload_id,
    p_image_name,
    p_chunk_id,
    v_company_id,
    v_site_id,
    v_pilot_program_id,
    v_firmware_version
  ) RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

-- Function to get protocol-compliant field mapping
CREATE OR REPLACE FUNCTION get_mqtt_field_mapping(
  p_message_type text,
  p_direction text
) RETURNS TABLE (
  mqtt_field text,
  db_field text,
  data_type text,
  required boolean,
  example text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    mqtt_field_name,
    database_field_name,
    data_type,
    required,
    example_value
  FROM mqtt_protocol_fields
  WHERE message_type = p_message_type
    AND direction = p_direction
  ORDER BY required DESC, mqtt_field_name;
$$;

-- Function to validate MQTT message against protocol
CREATE OR REPLACE FUNCTION validate_mqtt_message(
  p_message_type text,
  p_direction text,
  p_payload jsonb
) RETURNS TABLE (
  is_valid boolean,
  missing_required_fields text[],
  unknown_fields text[]
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_required_fields text[];
  v_allowed_fields text[];
  v_payload_fields text[];
  v_missing text[];
  v_unknown text[];
BEGIN
  -- Get required fields
  SELECT array_agg(mqtt_field_name)
  INTO v_required_fields
  FROM mqtt_protocol_fields
  WHERE message_type = p_message_type
    AND direction = p_direction
    AND required = true;

  -- Get all allowed fields
  SELECT array_agg(mqtt_field_name)
  INTO v_allowed_fields
  FROM mqtt_protocol_fields
  WHERE message_type = p_message_type
    AND direction = p_direction;

  -- Get fields in payload
  SELECT array_agg(key)
  INTO v_payload_fields
  FROM jsonb_object_keys(p_payload) AS key;

  -- Find missing required fields
  SELECT array_agg(field)
  INTO v_missing
  FROM unnest(v_required_fields) AS field
  WHERE field NOT IN (SELECT unnest(v_payload_fields));

  -- Find unknown fields
  SELECT array_agg(field)
  INTO v_unknown
  FROM unnest(v_payload_fields) AS field
  WHERE field NOT IN (SELECT unnest(v_allowed_fields));

  RETURN QUERY SELECT
    (v_missing IS NULL OR array_length(v_missing, 1) IS NULL) as is_valid,
    COALESCE(v_missing, ARRAY[]::text[]) as missing_required_fields,
    COALESCE(v_unknown, ARRAY[]::text[]) as unknown_fields;
END;
$$;

-- =====================================================
-- VIEWS FOR MONITORING
-- =====================================================

-- View for recent MQTT traffic
CREATE OR REPLACE VIEW mqtt_traffic_recent AS
SELECT
  mm.id,
  mm.created_at,
  mm.direction,
  mm.message_type,
  mm.mac_address,
  d.device_name,
  mm.topic,
  mm.payload,
  mm.session_id,
  mm.wake_payload_id,
  mm.image_name,
  mm.chunk_id,
  mm.error_message,
  c.name as company_name,
  s.name as site_name
FROM mqtt_messages mm
LEFT JOIN devices d ON mm.device_id = d.device_id
LEFT JOIN companies c ON mm.company_id = c.company_id
LEFT JOIN sites s ON mm.site_id = s.site_id
WHERE mm.created_at > now() - interval '24 hours'
ORDER BY mm.created_at DESC;

-- View for protocol compliance issues
CREATE OR REPLACE VIEW mqtt_protocol_issues AS
SELECT
  mm.id,
  mm.created_at,
  mm.mac_address,
  d.device_name,
  mm.message_type,
  mm.direction,
  mm.error_message,
  mm.payload,
  c.name as company_name
FROM mqtt_messages mm
LEFT JOIN devices d ON mm.device_id = d.device_id
LEFT JOIN companies c ON mm.company_id = c.company_id
WHERE mm.error_message IS NOT NULL
ORDER BY mm.created_at DESC;

COMMENT ON TABLE mqtt_messages IS 'Comprehensive log of all MQTT traffic for protocol compliance and debugging';
COMMENT ON TABLE mqtt_protocol_fields IS 'Reference table defining exact field names and types per BrainlyTree ESP32-CAM protocol specification';
COMMENT ON FUNCTION log_mqtt_message IS 'Logs an MQTT message with full context for auditing and debugging';
COMMENT ON FUNCTION validate_mqtt_message IS 'Validates MQTT message payload against protocol specification';
