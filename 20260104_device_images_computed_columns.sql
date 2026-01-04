/*
  # Device Images - Computed Columns and Enhanced Indexing

  ## Overview
  This migration establishes device_images as the single source of truth for all wake data,
  including environmental telemetry. Previously, device_telemetry was used for historical
  analysis, but all environmental data is now stored in device_images.metadata JSONB.

  ## Changes

  1. **Computed Columns**
     - Add generated columns for fast access to environmental data from metadata JSONB
     - temperature: Extracted from metadata->>'temperature' as numeric
     - humidity: Extracted from metadata->>'humidity' as numeric
     - pressure: Extracted from metadata->>'pressure' as numeric
     - gas_resistance: Extracted from metadata->>'gas_resistance' as numeric

  2. **Performance Indexes**
     - Create indexes on computed columns for fast time-series queries
     - Create GIN index on metadata JSONB for flexible querying
     - Enable efficient filtering and aggregation operations

  3. **Documentation**
     - Update table comment to reflect canonical status
     - Document LOCF (Last Observation Carried Forward) strategy for gaps

  ## Architecture Notes

  - device_images now contains complete wake lifecycle data
  - Each row represents one holistic wake session with all attributes
  - Environmental data is part of the wake record, not separate telemetry
  - LOCF is applied when metadata fields are null (handled by helper function)
  - device_telemetry is deprecated and will be removed in future migration

  ## Application Instructions

  Apply via Supabase SQL Editor:
  https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql
*/

-- Add computed columns for environmental data from metadata JSONB
-- These are STORED (not VIRTUAL) for better query performance
ALTER TABLE device_images
ADD COLUMN IF NOT EXISTS temperature NUMERIC
GENERATED ALWAYS AS ((metadata->>'temperature')::numeric) STORED;

ALTER TABLE device_images
ADD COLUMN IF NOT EXISTS humidity NUMERIC
GENERATED ALWAYS AS ((metadata->>'humidity')::numeric) STORED;

ALTER TABLE device_images
ADD COLUMN IF NOT EXISTS pressure NUMERIC
GENERATED ALWAYS AS ((metadata->>'pressure')::numeric) STORED;

ALTER TABLE device_images
ADD COLUMN IF NOT EXISTS gas_resistance NUMERIC
GENERATED ALWAYS AS ((metadata->>'gas_resistance')::numeric) STORED;

-- Create indexes on computed columns for fast time-series queries
CREATE INDEX IF NOT EXISTS idx_device_images_temperature
ON device_images(temperature) WHERE temperature IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_images_humidity
ON device_images(humidity) WHERE humidity IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_images_pressure
ON device_images(pressure) WHERE pressure IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_images_gas_resistance
ON device_images(gas_resistance) WHERE gas_resistance IS NOT NULL;

-- Create GIN index on metadata JSONB for flexible queries
CREATE INDEX IF NOT EXISTS idx_device_images_metadata_gin
ON device_images USING GIN (metadata);

-- Create composite index for device + time series queries (common pattern)
CREATE INDEX IF NOT EXISTS idx_device_images_device_captured
ON device_images(device_id, captured_at DESC) WHERE status = 'complete';

-- Create composite index for session + time series queries
CREATE INDEX IF NOT EXISTS idx_device_images_session_captured
ON device_images(site_device_session_id, captured_at DESC) WHERE status = 'complete';

-- Update table and column comments to reflect architectural role
COMMENT ON TABLE device_images IS
'Canonical source of truth for device wake data. Each row represents one complete wake session with environmental telemetry, image data, MGI scoring, and metadata. Replaces device_telemetry for historical analysis.';

COMMENT ON COLUMN device_images.metadata IS
'Complete device metadata including environmental readings (temperature, humidity, pressure, gas_resistance), location data, and device state. This is the authoritative source for all wake-associated data.';

COMMENT ON COLUMN device_images.temperature IS
'Computed column: Temperature in Celsius extracted from metadata JSONB. Indexed for fast time-series queries.';

COMMENT ON COLUMN device_images.humidity IS
'Computed column: Relative humidity (%) extracted from metadata JSONB. Indexed for fast time-series queries.';

COMMENT ON COLUMN device_images.pressure IS
'Computed column: Atmospheric pressure (hPa) extracted from metadata JSONB. Indexed for fast time-series queries.';

COMMENT ON COLUMN device_images.gas_resistance IS
'Computed column: Gas sensor resistance (Ohms) extracted from metadata JSONB. Indexed for fast time-series queries.';

COMMENT ON COLUMN device_images.wake_payload_id IS
'Links this image to its wake payload record. Critical for MQTT protocol compliance and wake lifecycle tracking.';
