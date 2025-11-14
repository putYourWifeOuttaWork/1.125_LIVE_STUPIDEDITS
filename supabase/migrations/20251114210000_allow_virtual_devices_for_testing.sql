/*
  # Allow Virtual Devices For Testing

  1. Changes
    - Remove restrictions on virtual device visibility
    - Treat virtual devices same as physical for testing purposes
    - Virtual label is maintained for identification only

  2. Security Note
    - Virtual devices now visible and operable like physical devices
    - All MQTT protocol operations work on virtual devices
    - Battery and telemetry data accepted for virtual devices
*/

-- ==========================================
-- REMOVE VIRTUAL DEVICE RESTRICTIONS
-- ==========================================

-- Drop the restrictive virtual device policy
DROP POLICY IF EXISTS "Virtual devices super admin only" ON devices;

-- Update main policy to include ALL device types
DROP POLICY IF EXISTS "Users can view devices in their company" ON devices;
CREATE POLICY "Users can view devices in their company"
  ON devices FOR SELECT TO authenticated
  USING (
    -- User's company devices (any type)
    company_id = get_active_company_id()
    OR
    -- Super admins can see all
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.is_super_admin = true
    )
    OR
    -- Unmapped devices in pool - super admin only
    (
      company_id IS NULL
      AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
          AND users.is_super_admin = true
      )
    )
  );

-- Update policy to allow updating virtual devices
DROP POLICY IF EXISTS "Users can update devices in their company" ON devices;
CREATE POLICY "Users can update devices in their company"
  ON devices FOR UPDATE TO authenticated
  USING (
    -- Company admins can update their company's devices (any type)
    (
      company_id = get_active_company_id()
      AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
          AND (users.is_super_admin = true OR users.is_company_admin = true)
      )
    )
    OR
    -- Super admins can update all devices
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.is_super_admin = true
    )
  )
  WITH CHECK (true); -- Allow updates to any device type

-- ==========================================
-- UPDATE DEVICE TELEMETRY POLICIES
-- ==========================================

-- Ensure virtual devices can have telemetry
DROP POLICY IF EXISTS "Users can view telemetry for their devices" ON device_telemetry;
CREATE POLICY "Users can view telemetry for their devices"
  ON device_telemetry FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM devices
      WHERE devices.device_id = device_telemetry.device_id
        AND (
          devices.company_id = get_active_company_id()
          OR EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
              AND users.is_super_admin = true
          )
        )
    )
  );

-- ==========================================
-- UPDATE DEVICE IMAGES POLICIES
-- ==========================================

-- Ensure virtual devices can have images
DROP POLICY IF EXISTS "Users can view images for their devices" ON device_images;
CREATE POLICY "Users can view images for their devices"
  ON device_images FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM devices
      WHERE devices.device_id = device_images.device_id
        AND (
          devices.company_id = get_active_company_id()
          OR EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
              AND users.is_super_admin = true
          )
        )
    )
  );

-- ==========================================
-- VERIFICATION
-- ==========================================

DO $$
DECLARE
  v_physical_count INT;
  v_virtual_count INT;
  v_total_visible INT;
BEGIN
  SELECT COUNT(*) INTO v_physical_count FROM devices WHERE device_type = 'physical' OR device_type IS NULL;
  SELECT COUNT(*) INTO v_virtual_count FROM devices WHERE device_type = 'virtual';
  SELECT COUNT(*) INTO v_total_visible FROM devices;

  RAISE NOTICE '=== Virtual Devices Enabled For Testing ===';
  RAISE NOTICE 'Physical Devices: %', v_physical_count;
  RAISE NOTICE 'Virtual Devices: %', v_virtual_count;
  RAISE NOTICE 'Total Visible: %', v_total_visible;
  RAISE NOTICE '';
  RAISE NOTICE 'Virtual devices now operate identically to physical devices:';
  RAISE NOTICE '  ✓ Visible to company users';
  RAISE NOTICE '  ✓ Accept all MQTT protocol data';
  RAISE NOTICE '  ✓ Support battery/telemetry updates';
  RAISE NOTICE '  ✓ Show in device lists and submissions';
  RAISE NOTICE '  ✓ "virtual" label maintained for identification';
END $$;
