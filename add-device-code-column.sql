-- Add device_code column to devices table
-- This column should have been added by the junction tables migration but was missing

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'device_code'
  ) THEN
    ALTER TABLE devices ADD COLUMN device_code TEXT UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_devices_device_code ON devices(device_code);
    COMMENT ON COLUMN devices.device_code IS 'Human-readable unique device identifier (e.g., DEVICE-ESP32S3-001)';

    RAISE NOTICE 'Added device_code column to devices table';
  ELSE
    RAISE NOTICE 'device_code column already exists';
  END IF;
END $$;
