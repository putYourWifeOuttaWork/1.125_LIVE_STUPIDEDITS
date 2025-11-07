/*
  # Modify Petri Observations Table for IoT Device Support

  1. Changes
    - Add `is_device_generated` flag to distinguish automated observations
    - Add `device_capture_metadata` JSONB field for storing device sensor data
    - Add index on is_device_generated for filtering

  2. Purpose
    - Store full device metadata (temperature, humidity, pressure, gas_resistance) with each observation
    - Enable filtering and analytics on device vs. human captured observations
    - Preserve all sensor readings for correlation analysis

  3. Device Metadata Structure
    {
      "temperature": 25.5,
      "humidity": 45.2,
      "pressure": 1010.5,
      "gas_resistance": 15.3,
      "capture_timestamp": "2025-08-29T14:30:00Z",
      "device_mac": "B8F862F9CFB8",
      "firmware_version": "1.0.0",
      "battery_voltage": 3.8,
      "wifi_rssi": -65,
      "error_code": 0
    }
*/

-- Add new columns to petri_observations table
DO $$
BEGIN
  -- Add is_device_generated flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petri_observations' AND column_name = 'is_device_generated'
  ) THEN
    ALTER TABLE petri_observations ADD COLUMN is_device_generated BOOLEAN DEFAULT false;
  END IF;

  -- Add device_capture_metadata JSONB field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petri_observations' AND column_name = 'device_capture_metadata'
  ) THEN
    ALTER TABLE petri_observations ADD COLUMN device_capture_metadata JSONB;
  END IF;
END $$;

-- Create index for device-generated observations
CREATE INDEX IF NOT EXISTS idx_petri_observations_device_generated ON petri_observations(is_device_generated) WHERE is_device_generated = true;

-- Create GIN index for device_capture_metadata JSONB queries
CREATE INDEX IF NOT EXISTS idx_petri_observations_device_metadata ON petri_observations USING GIN (device_capture_metadata);

-- Add helpful comments
COMMENT ON COLUMN petri_observations.is_device_generated IS 'Flag indicating this observation was created automatically by an IoT device';
COMMENT ON COLUMN petri_observations.device_capture_metadata IS 'Full device sensor data at time of capture (temperature, humidity, pressure, gas_resistance, etc.)';
