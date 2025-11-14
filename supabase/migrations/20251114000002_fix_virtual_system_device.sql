/*
  # Fix Virtual System Device

  1. Changes
    - Add device_type column to differentiate physical vs virtual devices
    - Update system device with proper metadata
    - Exclude virtual devices from user-facing queries
    - Set company_id to NULL for system devices (accessible to all)

  2. Device Types
    - 'physical' - Real IoT devices
    - 'virtual' - System-generated placeholder devices
*/

-- ==========================================
-- ADD DEVICE TYPE COLUMN
-- ==========================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'device_type'
  ) THEN
    ALTER TABLE devices ADD COLUMN device_type TEXT DEFAULT 'physical' CHECK (device_type IN ('physical', 'virtual'));
    COMMENT ON COLUMN devices.device_type IS 'Type of device: physical (real IoT device) or virtual (system placeholder)';
  END IF;
END $$;

-- ==========================================
-- UPDATE SYSTEM DEVICE
-- ==========================================

-- Mark the system device as virtual and ensure it has proper status
UPDATE devices
SET
  device_type = 'virtual',
  provisioning_status = 'system',
  is_active = true,
  company_id = NULL,  -- System devices are not company-specific
  last_seen_at = NOW(),  -- Mark as "always available"
  updated_at = NOW()
WHERE device_mac = 'SYSTEM:AUTO:GENERATED'
  OR hardware_version = 'SYSTEM';

-- ==========================================
-- UPDATE PROVISIONING STATUS CHECK
-- ==========================================

-- Add 'system' as a valid provisioning status
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'devices'
      AND constraint_name LIKE '%provisioning_status%'
  ) THEN
    ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_provisioning_status_check;
  END IF;

  -- Add updated constraint
  ALTER TABLE devices ADD CONSTRAINT devices_provisioning_status_check
    CHECK (provisioning_status IN (
      'pending_approval',
      'pending_mapping',
      'active',
      'inactive',
      'decommissioned',
      'system'
    ));
END $$;

COMMENT ON CONSTRAINT devices_provisioning_status_check ON devices IS 'Valid provisioning statuses including system for virtual devices';

-- ==========================================
-- UPDATE RLS POLICIES TO HANDLE VIRTUAL DEVICES
-- ==========================================

-- System devices should be visible to all authenticated users but not editable
DROP POLICY IF EXISTS "System devices visible to all authenticated users" ON devices;
CREATE POLICY "System devices visible to all authenticated users"
  ON devices FOR SELECT TO authenticated
  USING (device_type = 'virtual' AND provisioning_status = 'system');

-- Ensure physical devices still follow company isolation
DROP POLICY IF EXISTS "Users can view devices in their company" ON devices;
CREATE POLICY "Users can view devices in their company"
  ON devices FOR SELECT TO authenticated
  USING (
    device_type = 'physical'
    AND (
      -- User's company devices
      company_id = get_active_company_id()
      OR
      -- Super admins can see all
      EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
          AND users.is_super_admin = true
      )
    )
  );

-- Virtual devices cannot be updated by users
DROP POLICY IF EXISTS "Prevent updates to virtual devices" ON devices;
CREATE POLICY "Prevent updates to virtual devices"
  ON devices FOR UPDATE TO authenticated
  USING (device_type = 'physical');

-- ==========================================
-- CREATE HELPER FUNCTION TO EXCLUDE VIRTUAL DEVICES
-- ==========================================

CREATE OR REPLACE FUNCTION is_physical_device(p_device_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM devices
    WHERE device_id = p_device_id
      AND device_type = 'physical'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION is_physical_device IS 'Check if a device is a physical IoT device (not virtual/system)';

-- ==========================================
-- UPDATE EXISTING QUERIES
-- ==========================================

-- Update get_unassigned_devices to exclude virtual devices
CREATE OR REPLACE FUNCTION get_unassigned_devices()
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
    AND d.device_type = 'physical'  -- Exclude virtual devices
    AND d.provisioning_status NOT IN ('decommissioned', 'system')
  ORDER BY d.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ==========================================
-- ADD INDEX FOR DEVICE TYPE
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_devices_device_type ON devices(device_type) WHERE device_type = 'physical';
CREATE INDEX IF NOT EXISTS idx_devices_virtual ON devices(device_id) WHERE device_type = 'virtual';

-- ==========================================
-- SUMMARY QUERY
-- ==========================================

DO $$
DECLARE
  v_system_device RECORD;
  v_physical_count INT;
  v_virtual_count INT;
BEGIN
  -- Get system device details
  SELECT * INTO v_system_device
  FROM devices
  WHERE device_type = 'virtual'
  LIMIT 1;

  -- Count devices by type
  SELECT COUNT(*) INTO v_physical_count FROM devices WHERE device_type = 'physical';
  SELECT COUNT(*) INTO v_virtual_count FROM devices WHERE device_type = 'virtual';

  RAISE NOTICE '=== Virtual Device Fix Applied ===';
  RAISE NOTICE 'System Device ID: %', v_system_device.device_id;
  RAISE NOTICE 'System Device Status: %', v_system_device.provisioning_status;
  RAISE NOTICE 'Physical Devices: %', v_physical_count;
  RAISE NOTICE 'Virtual Devices: %', v_virtual_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Virtual devices are now:';
  RAISE NOTICE '  - Marked with device_type = ''virtual''';
  RAISE NOTICE '  - Have provisioning_status = ''system''';
  RAISE NOTICE '  - Excluded from user device lists';
  RAISE NOTICE '  - Visible but not editable';
  RAISE NOTICE '  - Company_id is NULL (accessible to all)';
END $$;
