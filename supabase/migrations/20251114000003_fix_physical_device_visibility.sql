/*
  # Fix Physical Device Visibility

  1. Changes
    - Update RLS policies to show physical devices correctly
    - Ensure virtual devices are hidden from users
    - Unmapped devices visible to super admins only

  2. Prerequisites
    - Migration 20251114000002 must be applied first
    - device_type column must exist
*/

-- ==========================================
-- UPDATE RLS POLICIES FOR CORRECT VISIBILITY
-- ==========================================

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

-- Policy 2: Virtual devices NOT visible to regular users (super admin only)
DROP POLICY IF EXISTS "System devices visible to all authenticated users" ON devices;
DROP POLICY IF EXISTS "System devices hidden from users" ON devices;
CREATE POLICY "Virtual devices super admin only"
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
  );

-- ==========================================
-- VERIFICATION QUERY
-- ==========================================

DO $$
DECLARE
  v_physical_count INT;
  v_virtual_count INT;
  v_unmapped_count INT;
  v_mapped_count INT;
BEGIN
  -- Count devices by type
  SELECT COUNT(*) INTO v_physical_count FROM devices WHERE device_type = 'physical';
  SELECT COUNT(*) INTO v_virtual_count FROM devices WHERE device_type = 'virtual';
  SELECT COUNT(*) INTO v_unmapped_count FROM devices WHERE device_type = 'physical' AND site_id IS NULL;
  SELECT COUNT(*) INTO v_mapped_count FROM devices WHERE device_type = 'physical' AND site_id IS NOT NULL;

  RAISE NOTICE '=== Device Visibility Configured ===';
  RAISE NOTICE 'Physical Devices (visible to users): %', v_physical_count;
  RAISE NOTICE '  - Mapped to sites: %', v_mapped_count;
  RAISE NOTICE '  - Unmapped (device pool): %', v_unmapped_count;
  RAISE NOTICE 'Virtual Devices (super admin only): %', v_virtual_count;
  RAISE NOTICE '';
  RAISE NOTICE 'RLS Policies Applied:';
  RAISE NOTICE '  ✓ Physical devices visible to company users';
  RAISE NOTICE '  ✓ Unmapped devices visible to super admins only';
  RAISE NOTICE '  ✓ Virtual devices hidden from regular users';
  RAISE NOTICE '  ✓ Company admins can update their devices';
END $$;
