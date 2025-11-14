/*
  # Fix Virtual System Device

  1. Changes
    - Add device_type column to differentiate physical vs virtual devices
    - Update system device FIRST (before changing constraint)
    - Add 'system' to provisioning_status constraint
    - Exclude virtual devices from user-facing queries

  2. Device Types
    - 'physical' - Real IoT devices (default)
    - 'virtual' - System-generated placeholder devices

  3. Current Status Values
    - 'mapped', 'inactive', 'active' currently exist
    - Adding 'pending_approval', 'pending_mapping', 'decommissioned', 'system'
*/

-- ==========================================
-- STEP 1: DROP OLD PROVISIONING STATUS CONSTRAINT
-- ==========================================

-- Drop the existing constraint FIRST so we can update to 'system'
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_provisioning_status_check;

-- ==========================================
-- STEP 2: ADD DEVICE TYPE COLUMN
-- ==========================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'device_type'
  ) THEN
    ALTER TABLE devices ADD COLUMN device_type TEXT DEFAULT 'physical';
    COMMENT ON COLUMN devices.device_type IS 'Type of device: physical (real IoT device) or virtual (system placeholder)';
  END IF;
END $$;

-- ==========================================
-- STEP 3: UPDATE SYSTEM DEVICE
-- ==========================================

-- Now we can safely update to 'system' status since constraint is dropped
UPDATE devices
SET
  device_type = 'virtual',
  provisioning_status = 'system',
  is_active = true,
  company_id = NULL,
  last_seen_at = NOW(),
  updated_at = NOW()
WHERE device_mac = 'SYSTEM:AUTO:GENERATED'
  OR hardware_version = 'SYSTEM';

-- ==========================================
-- STEP 4: UPDATE ALL OTHER DEVICES
-- ==========================================

UPDATE devices
SET device_type = 'physical'
WHERE device_type IS NULL
  AND device_mac != 'SYSTEM:AUTO:GENERATED'
  AND hardware_version != 'SYSTEM';

-- ==========================================
-- STEP 5: ADD NEW CONSTRAINTS
-- ==========================================

-- Add device_type constraint
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_device_type_check;
ALTER TABLE devices ADD CONSTRAINT devices_device_type_check
  CHECK (device_type IN ('physical', 'virtual'));

-- Add NEW provisioning_status constraint with 'system' included
ALTER TABLE devices ADD CONSTRAINT devices_provisioning_status_check
  CHECK (provisioning_status IN (
    'pending_approval',
    'pending_mapping',
    'mapped',
    'active',
    'inactive',
    'decommissioned',
    'system'
  ));

COMMENT ON CONSTRAINT devices_provisioning_status_check ON devices IS 'Valid provisioning statuses including system for virtual devices';

-- ==========================================
-- CREATE HELPER FUNCTION
-- ==========================================

CREATE OR REPLACE FUNCTION is_physical_device(p_device_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM devices
    WHERE device_id = p_device_id
      AND (device_type = 'physical' OR device_type IS NULL)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION is_physical_device IS 'Check if a device is a physical IoT device (not virtual/system)';

-- ==========================================
-- UPDATE get_unassigned_devices FUNCTION
-- ==========================================

-- Drop existing function first (signature changed)
DROP FUNCTION IF EXISTS get_unassigned_devices();

-- Recreate with updated logic
CREATE FUNCTION get_unassigned_devices()
RETURNS TABLE (
  device_id UUID,
  device_code TEXT,
  device_type TEXT,
  status TEXT,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  firmware_version TEXT,
  battery_level NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.device_id,
    d.device_code,
    d.hardware_version as device_type,
    d.provisioning_status as status,
    d.last_seen_at as last_seen,
    d.created_at,
    d.firmware_version,
    d.battery_health_percent as battery_level
  FROM devices d
  WHERE d.company_id IS NULL
    AND (d.device_type = 'physical' OR d.device_type IS NULL)
    AND d.provisioning_status NOT IN ('decommissioned', 'system')
  ORDER BY d.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ==========================================
-- ADD INDEXES
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_devices_device_type_physical ON devices(device_type) WHERE device_type = 'physical';
CREATE INDEX IF NOT EXISTS idx_devices_device_type_virtual ON devices(device_id) WHERE device_type = 'virtual';

-- ==========================================
-- VERIFICATION
-- ==========================================

DO $$
DECLARE
  v_system_device RECORD;
  v_physical_count INT;
  v_virtual_count INT;
BEGIN
  SELECT * INTO v_system_device
  FROM devices
  WHERE device_type = 'virtual'
  LIMIT 1;

  SELECT COUNT(*) INTO v_physical_count FROM devices WHERE device_type = 'physical';
  SELECT COUNT(*) INTO v_virtual_count FROM devices WHERE device_type = 'virtual';

  RAISE NOTICE '=== Virtual Device Fix Applied ===';
  RAISE NOTICE 'System Device ID: %', v_system_device.device_id;
  RAISE NOTICE 'System Device MAC: %', v_system_device.device_mac;
  RAISE NOTICE 'System Device Status: %', v_system_device.provisioning_status;
  RAISE NOTICE 'Physical Devices: %', v_physical_count;
  RAISE NOTICE 'Virtual Devices: %', v_virtual_count;
END $$;
