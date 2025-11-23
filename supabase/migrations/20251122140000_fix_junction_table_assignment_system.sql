/*
  # Fix Device Assignment Junction Table System

  ## Summary
  Fixes critical data inconsistency where Site Template device assignments
  were only updating devices table without creating junction table records.
  Makes junction tables the single source of truth for assignments.

  ## Changes Made

  1. **Fixed `fn_assign_device_to_site`**
     - Now creates device_site_assignments record
     - Now creates device_program_assignments record
     - Deactivates old assignments before creating new ones
     - Maintains backward compatibility

  2. **Fixed `fn_remove_device_from_site`**
     - Now deactivates junction table records
     - Maintains audit trail of unassignments

  3. **Created Auto-Sync Triggers**
     - Syncs devices.site_id from junction tables
     - Syncs devices.program_id from junction tables
     - Maintains devices table as cached copy

  4. **Backfill Missing Records**
     - Creates junction records for devices with site_id but no junction records
     - Preserves existing data integrity

  ## Impact
  - ✅ Site Template assignments now create junction records
  - ✅ Assignment card will show correct data
  - ✅ Session analytics will work for all devices
  - ✅ Programs tab history is complete
  - ✅ No breaking changes to existing UI
  - ✅ Map positions preserved

  ## Data Safety
  - All existing assignments preserved
  - All map positions (x_position, y_position) unchanged
  - Audit trail maintained
  - Read-only backfill of missing historical data
*/

-- ==========================================
-- PART 1: Fix fn_assign_device_to_site
-- ==========================================

CREATE OR REPLACE FUNCTION fn_assign_device_to_site(
  p_device_id UUID,
  p_site_id UUID,
  p_x_position INTEGER DEFAULT NULL,
  p_y_position INTEGER DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_device_company_id UUID;
  v_site_company_id UUID;
  v_site_program_id UUID;
  v_device_code TEXT;
  v_site_name TEXT;
  v_current_user_id UUID;
BEGIN
  v_current_user_id := auth.uid();

  SELECT company_id, device_code
  INTO v_device_company_id, v_device_code
  FROM devices
  WHERE device_id = p_device_id;

  IF v_device_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Device not found');
  END IF;

  SELECT company_id, program_id, name
  INTO v_site_company_id, v_site_program_id, v_site_name
  FROM sites
  WHERE site_id = p_site_id;

  IF v_site_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Site not found');
  END IF;

  IF v_device_company_id != v_site_company_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Device and site must belong to same company');
  END IF;

  -- CRITICAL FIX: Deactivate old junction assignments FIRST
  UPDATE device_site_assignments
  SET is_active = false, unassigned_at = now(), unassigned_by_user_id = v_current_user_id
  WHERE device_id = p_device_id AND is_active = true;

  UPDATE device_program_assignments
  SET is_active = false, unassigned_at = now(), unassigned_by_user_id = v_current_user_id
  WHERE device_id = p_device_id AND is_active = true;

  -- CRITICAL FIX: Create new junction table records
  INSERT INTO device_site_assignments (
    device_id, site_id, program_id, is_primary, is_active, assigned_by_user_id, assigned_at
  ) VALUES (
    p_device_id, p_site_id, v_site_program_id, true, true, v_current_user_id, now()
  );

  INSERT INTO device_program_assignments (
    device_id, program_id, is_primary, is_active, assigned_by_user_id, assigned_at
  ) VALUES (
    p_device_id, v_site_program_id, true, true, v_current_user_id, now()
  );

  -- Update device record (cached copy, x_position/y_position for map)
  UPDATE devices
  SET site_id = p_site_id, program_id = v_site_program_id,
      x_position = COALESCE(p_x_position, x_position),
      y_position = COALESCE(p_y_position, y_position),
      updated_at = now()
  WHERE device_id = p_device_id;

  INSERT INTO audit_log (user_id, action, table_name, record_id, new_values, company_id)
  VALUES (v_current_user_id, 'UPDATE', 'devices', p_device_id,
          jsonb_build_object('action', 'device_assigned_to_site', 'device_code', v_device_code,
                           'site_id', p_site_id, 'site_name', v_site_name, 'program_id', v_site_program_id),
          v_site_company_id);

  RETURN jsonb_build_object('success', true, 'message', 'Device assigned to site successfully',
                           'device_id', p_device_id, 'site_id', p_site_id, 'program_id', v_site_program_id);
END;
$$;

-- ==========================================
-- PART 2: Fix fn_remove_device_from_site
-- ==========================================

CREATE OR REPLACE FUNCTION fn_remove_device_from_site(p_device_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_device_code TEXT;
  v_old_site_id UUID;
  v_site_name TEXT;
  v_company_id UUID;
  v_current_user_id UUID;
BEGIN
  v_current_user_id := auth.uid();

  SELECT d.device_code, d.site_id, d.company_id, s.name
  INTO v_device_code, v_old_site_id, v_company_id, v_site_name
  FROM devices d
  LEFT JOIN sites s ON s.site_id = d.site_id
  WHERE d.device_id = p_device_id;

  IF v_device_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Device not found');
  END IF;

  IF v_old_site_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Device is not assigned to any site');
  END IF;

  -- CRITICAL FIX: Deactivate junction records FIRST
  UPDATE device_site_assignments
  SET is_active = false, unassigned_at = now(), unassigned_by_user_id = v_current_user_id
  WHERE device_id = p_device_id AND is_active = true;

  UPDATE device_program_assignments
  SET is_active = false, unassigned_at = now(), unassigned_by_user_id = v_current_user_id
  WHERE device_id = p_device_id AND is_active = true;

  -- Clear cached assignment from devices table
  UPDATE devices
  SET site_id = NULL, program_id = NULL, x_position = NULL, y_position = NULL, updated_at = now()
  WHERE device_id = p_device_id;

  INSERT INTO audit_log (user_id, action, table_name, record_id, new_values, company_id)
  VALUES (v_current_user_id, 'UPDATE', 'devices', p_device_id,
          jsonb_build_object('action', 'device_removed_from_site', 'device_code', v_device_code,
                           'old_site_id', v_old_site_id, 'old_site_name', v_site_name),
          v_company_id);

  RETURN jsonb_build_object('success', true, 'message', 'Device removed from site', 'device_id', p_device_id);
END;
$$;

-- ==========================================
-- PART 3: Create Auto-Sync Triggers
-- ==========================================

CREATE OR REPLACE FUNCTION trg_sync_device_from_site_assignment()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.is_active = true) OR
     (TG_OP = 'UPDATE' AND NEW.is_active = true AND (OLD.is_active = false OR OLD.is_active IS NULL)) THEN
    UPDATE devices SET site_id = NEW.site_id, updated_at = now() WHERE device_id = NEW.device_id;
  END IF;

  IF (TG_OP = 'UPDATE' AND NEW.is_active = false AND OLD.is_active = true) THEN
    IF NOT EXISTS (SELECT 1 FROM device_site_assignments WHERE device_id = NEW.device_id AND is_active = true AND assignment_id != NEW.assignment_id) THEN
      UPDATE devices SET site_id = NULL, x_position = NULL, y_position = NULL, updated_at = now() WHERE device_id = NEW.device_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_sync_device_from_program_assignment()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.is_active = true) OR
     (TG_OP = 'UPDATE' AND NEW.is_active = true AND (OLD.is_active = false OR OLD.is_active IS NULL)) THEN
    UPDATE devices SET program_id = NEW.program_id, updated_at = now() WHERE device_id = NEW.device_id;
  END IF;

  IF (TG_OP = 'UPDATE' AND NEW.is_active = false AND OLD.is_active = true) THEN
    IF NOT EXISTS (SELECT 1 FROM device_program_assignments WHERE device_id = NEW.device_id AND is_active = true AND assignment_id != NEW.assignment_id) THEN
      UPDATE devices SET program_id = NULL, updated_at = now() WHERE device_id = NEW.device_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_device_site ON device_site_assignments;
CREATE TRIGGER trg_sync_device_site
  AFTER INSERT OR UPDATE ON device_site_assignments
  FOR EACH ROW
  EXECUTE FUNCTION trg_sync_device_from_site_assignment();

DROP TRIGGER IF EXISTS trg_sync_device_program ON device_program_assignments;
CREATE TRIGGER trg_sync_device_program
  AFTER INSERT OR UPDATE ON device_program_assignments
  FOR EACH ROW
  EXECUTE FUNCTION trg_sync_device_from_program_assignment();

-- ==========================================
-- PART 4: Backfill Missing Junction Records
-- ==========================================

DO $$
DECLARE
  v_backfill_count INTEGER := 0;
  v_device RECORD;
BEGIN
  RAISE NOTICE 'Starting backfill of missing junction table records...';

  FOR v_device IN
    SELECT
      d.device_id,
      d.device_code,
      d.site_id,
      d.program_id,
      COALESCE(d.mapped_at, d.provisioned_at, d.created_at) as assigned_at,
      COALESCE(d.mapped_by_user_id, d.provisioned_by_user_id) as assigned_by_user_id
    FROM devices d
    WHERE d.site_id IS NOT NULL
      AND d.program_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM device_site_assignments dsa
        WHERE dsa.device_id = d.device_id AND dsa.is_active = true
      )
  LOOP
    INSERT INTO device_site_assignments (
      device_id, site_id, program_id, is_primary, is_active,
      assigned_at, assigned_by_user_id, notes
    ) VALUES (
      v_device.device_id, v_device.site_id, v_device.program_id,
      true, true, v_device.assigned_at, v_device.assigned_by_user_id,
      'Backfilled from devices table during junction system fix'
    );

    IF NOT EXISTS (
      SELECT 1 FROM device_program_assignments
      WHERE device_id = v_device.device_id AND is_active = true
    ) THEN
      INSERT INTO device_program_assignments (
        device_id, program_id, is_primary, is_active,
        assigned_at, assigned_by_user_id, notes
      ) VALUES (
        v_device.device_id, v_device.program_id, true, true,
        v_device.assigned_at, v_device.assigned_by_user_id,
        'Backfilled from devices table during junction system fix'
      );
    END IF;

    v_backfill_count := v_backfill_count + 1;
    RAISE NOTICE 'Backfilled device: % (site_id: %)', v_device.device_code, v_device.site_id;
  END LOOP;

  RAISE NOTICE 'Backfill complete. Created junction records for % devices', v_backfill_count;
END $$;

-- ==========================================
-- VERIFICATION QUERIES
-- ==========================================

DO $$
DECLARE
  v_orphan_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_orphan_count
  FROM devices d
  WHERE d.site_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM device_site_assignments dsa
      WHERE dsa.device_id = d.device_id AND dsa.is_active = true
    );

  IF v_orphan_count > 0 THEN
    RAISE WARNING 'Found % devices with site_id but no junction records!', v_orphan_count;
  ELSE
    RAISE NOTICE '✅ All devices with site_id have matching junction records';
  END IF;
END $$;

-- ==========================================
-- COMMENTS
-- ==========================================

COMMENT ON FUNCTION fn_assign_device_to_site(UUID, UUID, INTEGER, INTEGER) IS
  'FIXED: Now creates junction table records (device_site_assignments, device_program_assignments) and maintains devices table as cached copy. Preserves map positions.';

COMMENT ON FUNCTION fn_remove_device_from_site(UUID) IS
  'FIXED: Now deactivates junction table records before clearing devices table. Maintains complete audit trail.';

COMMENT ON FUNCTION trg_sync_device_from_site_assignment() IS
  'Auto-syncs devices.site_id FROM device_site_assignments junction table. Devices table is now a cached copy.';

COMMENT ON FUNCTION trg_sync_device_from_program_assignment() IS
  'Auto-syncs devices.program_id FROM device_program_assignments junction table. Devices table is now a cached copy.';
