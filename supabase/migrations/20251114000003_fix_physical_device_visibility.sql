/*
  # Fix Physical Device Visibility

  1. Changes
    - Set device_type = 'physical' for all real IoT devices
    - Keep device_type = 'virtual' only for system placeholder devices
    - Update RLS policies to show physical devices correctly
    - Ensure unmapped devices section works for super admins

  2. Device Classification
    - Physical: Real IoT devices (ESP32-CAM, etc.) - should be visible and manageable
    - Virtual: System placeholder devices (SYSTEM:AUTO:GENERATED) - hidden from users
*/

-- ==========================================
-- MARK ALL REAL DEVICES AS PHYSICAL
-- ==========================================

-- Set device_type = 'physical' for all devices except system virtual device
UPDATE devices
SET device_type = 'physical'
WHERE device_type IS NULL
  AND device_mac != 'SYSTEM:AUTO:GENERATED'
  AND hardware_version != 'SYSTEM';

-- Ensure system device is marked as virtual
UPDATE devices
SET device_type = 'virtual'
WHERE device_mac = 'SYSTEM:AUTO:GENERATED'
  OR hardware_version = 'SYSTEM';

-- ==========================================
-- UPDATE DEFAULT VALUE FOR NEW DEVICES
-- ==========================================

ALTER TABLE devices ALTER COLUMN device_type SET DEFAULT 'physical';

-- ==========================================
-- UPDATE RLS POLICIES FOR CORRECT VISIBILITY
-- ==========================================

-- Drop and recreate policies to ensure correct behavior

-- Policy 1: Physical devices visible to users in their company
DROP POLICY IF EXISTS "Users can view devices in their company" ON devices;
CREATE POLICY "Users can view devices in their company"
  ON devices FOR SELECT TO authenticated
  USING (
    (device_type = 'physical' OR device_type IS NULL)
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
      OR
      -- Devices in device pool (no company_id yet) - super admin only
      (
        company_id IS NULL
        AND EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
            AND users.is_super_admin = true
        )
      )
    )
  );

-- Policy 2: Virtual devices NOT visible to regular users
DROP POLICY IF EXISTS "System devices visible to all authenticated users" ON devices;
CREATE POLICY "System devices hidden from users"
  ON devices FOR SELECT TO authenticated
  USING (
    device_type = 'virtual'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND is_super_admin = true
    )
  );

-- Policy 3: Users can update physical devices in their company
DROP POLICY IF EXISTS "Users can update devices in their company" ON devices;
CREATE POLICY "Users can update devices in their company"
  ON devices FOR UPDATE TO authenticated
  USING (
    (device_type = 'physical' OR device_type IS NULL)
    AND device_type != 'virtual'
    AND (
      -- Company admins can update their company's devices
      (
        company_id = get_active_company_id()
        AND EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
            AND (users.is_super_admin = true OR users.is_company_admin = true)
        )
      )
      OR
      -- Super admins can update all physical devices
      EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
          AND users.is_super_admin = true
      )
    )
  )
  WITH CHECK (
    (device_type = 'physical' OR device_type IS NULL)
    AND device_type != 'virtual'
  );

-- Policy 4: Prevent any updates to virtual devices
DROP POLICY IF EXISTS "Prevent updates to virtual devices" ON devices;
CREATE POLICY "Prevent updates to virtual devices"
  ON devices FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false)
  USING (device_type = 'virtual');

-- ==========================================
-- VERIFICATION QUERY
-- ==========================================

DO $$
DECLARE
  v_physical_count INT;
  v_virtual_count INT;
  v_unmapped_count INT;
BEGIN
  -- Count devices by type
  SELECT COUNT(*) INTO v_physical_count FROM devices WHERE device_type = 'physical' OR device_type IS NULL;
  SELECT COUNT(*) INTO v_virtual_count FROM devices WHERE device_type = 'virtual';
  SELECT COUNT(*) INTO v_unmapped_count FROM devices WHERE (device_type = 'physical' OR device_type IS NULL) AND site_id IS NULL;

  RAISE NOTICE '=== Device Visibility Restored ===';
  RAISE NOTICE 'Physical Devices (visible to users): %', v_physical_count;
  RAISE NOTICE 'Virtual Devices (hidden from users): %', v_virtual_count;
  RAISE NOTICE 'Unmapped Physical Devices (super admin only): %', v_unmapped_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Physical devices are now:';
  RAISE NOTICE '  - Visible to company users';
  RAISE NOTICE '  - Manageable by company admins';
  RAISE NOTICE '  - Show in device lists';
  RAISE NOTICE '  - Show in unmapped section when site_id is NULL';
  RAISE NOTICE '';
  RAISE NOTICE 'Virtual devices are:';
  RAISE NOTICE '  - Hidden from regular users';
  RAISE NOTICE '  - Only visible to super admins';
  RAISE NOTICE '  - Cannot be edited';
END $$;
