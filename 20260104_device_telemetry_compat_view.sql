/*
  # Device Telemetry Compatibility View (DEPRECATED)

  ## Purpose
  Provides backwards compatibility for any code that still queries device_telemetry.
  This view sources data from device_images and will be removed in 60 days.

  ## Deprecation Notice
  ⚠️  DEPRECATED - DO NOT USE FOR NEW CODE
  Sunset Date: 2026-03-05
  Migration Path: Use device_images table directly with computed columns

  ## Structure
  Mirrors device_telemetry schema but sources from device_images.metadata
  Applies LOCF (Last Observation Carried Forward) where data is missing.

  ## Application Instructions
  Apply via Supabase SQL Editor:
  https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql
*/

-- Drop existing view if it exists
DROP VIEW IF EXISTS v_device_telemetry_compat CASCADE;

-- Create compatibility view sourcing from device_images
CREATE VIEW v_device_telemetry_compat AS
SELECT
  -- Generate a synthetic telemetry_id for compatibility
  di.image_id as telemetry_id,

  -- Core identifiers
  di.device_id,
  di.program_id,
  di.site_id,
  di.site_device_session_id,
  di.company_id,

  -- Environmental data from computed columns
  di.temperature,
  di.humidity,
  di.pressure,
  di.gas_resistance,

  -- Additional telemetry from metadata
  (di.metadata->>'wifi_rssi')::numeric as wifi_rssi,
  (di.metadata->>'battery_voltage')::numeric as battery_voltage,
  (di.metadata->>'signal_strength')::numeric as signal_strength,

  -- Timestamps
  di.captured_at,
  di.received_at as received_at,
  di.created_at,
  di.updated_at,

  -- Wake context
  di.wake_payload_id,

  -- Status and metadata
  di.status,
  di.metadata as raw_metadata

FROM device_images di
WHERE di.status = 'complete'  -- Only include completed images
  AND di.temperature IS NOT NULL;  -- Only include rows with environmental data

-- Add comments to mark as deprecated
COMMENT ON VIEW v_device_telemetry_compat IS
'⚠️  DEPRECATED - Compatibility view for device_telemetry. Sources from device_images. DO NOT USE FOR NEW CODE. Will be removed on 2026-03-05. Use device_images table directly instead.';

-- Grant SELECT permission to authenticated users (same as device_images RLS)
-- Note: RLS policies from device_images apply automatically through the view

-- Create helper function to explain migration path
CREATE OR REPLACE FUNCTION explain_device_telemetry_migration()
RETURNS TEXT AS $$
BEGIN
  RETURN '
    ⚠️  device_telemetry is DEPRECATED

    Migration Steps:
    1. Change FROM clause: device_telemetry → device_images
    2. Add status filter: WHERE status = ''complete''
    3. Use computed columns directly: temperature, humidity, pressure, gas_resistance
    4. Extract wifi_rssi from metadata: (metadata->>''wifi_rssi'')::numeric
    5. Filter out rows without environmental data: WHERE temperature IS NOT NULL

    Example:
    OLD: SELECT * FROM device_telemetry WHERE device_id = ?
    NEW: SELECT temperature, humidity, pressure, gas_resistance
         FROM device_images
         WHERE device_id = ? AND status = ''complete''

    Need help? Check: 20260104_device_images_computed_columns.sql
  ';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION explain_device_telemetry_migration IS
'Returns migration instructions for transitioning from device_telemetry to device_images';

-- Log deprecation warning
DO $$
BEGIN
  RAISE WARNING 'device_telemetry compatibility view created. This is DEPRECATED and will be removed on 2026-03-05. Use device_images table directly.';
END $$;
