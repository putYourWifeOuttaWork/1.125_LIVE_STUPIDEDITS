/*
  # Normalize Device MAC Addresses Migration

  This migration normalizes MAC addresses while preserving special device identifiers.

  Steps:
  1. Create validation and normalization functions
  2. Remove duplicate devices (keep mapped, delete unmapped)
  3. Normalize all MAC addresses to uppercase hex without separators
  4. Preserve special identifiers (TEST-, SYSTEM:, VIRTUAL: prefixes)
  5. Add flexible check constraint
  6. Add column documentation
  7. Verify migration results
*/

-- ============================================================================
-- STEP 1: Create helper functions
-- ============================================================================

-- Function to check if a string matches MAC address pattern
CREATE OR REPLACE FUNCTION fn_is_valid_mac_address(mac TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Check if it's a valid MAC address pattern (various formats)
  -- Supports: AA:BB:CC:DD:EE:FF, AA-BB-CC-DD-EE-FF, AABBCCDDEEFF
  RETURN mac ~ '^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$'
      OR mac ~ '^[0-9A-Fa-f]{12}$';
END;
$$;

-- Function to normalize device identifiers
-- Normalizes MAC addresses to uppercase hex without separators
-- Preserves special identifiers unchanged
CREATE OR REPLACE FUNCTION fn_normalize_device_identifier(identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Return NULL for NULL input
  IF identifier IS NULL THEN
    RETURN NULL;
  END IF;

  -- Preserve special identifiers (TEST-, SYSTEM:, VIRTUAL: prefixes)
  IF identifier ~ '^(TEST-|SYSTEM:|VIRTUAL:)' THEN
    RETURN identifier;
  END IF;

  -- Check if it's a MAC address
  IF fn_is_valid_mac_address(identifier) THEN
    -- Remove all non-hex characters (colons, dashes, etc.) and convert to uppercase
    RETURN upper(regexp_replace(identifier, '[^0-9A-Fa-f]', '', 'g'));
  END IF;

  -- If it doesn't match any pattern, return as-is
  RETURN identifier;
END;
$$;

-- Function to validate device identifier format
CREATE OR REPLACE FUNCTION fn_is_valid_device_identifier(identifier TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- NULL is not valid
  IF identifier IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check for special identifiers
  IF identifier ~ '^(TEST-|SYSTEM:|VIRTUAL:)' THEN
    RETURN TRUE;
  END IF;

  -- Check for normalized MAC address (12 hex characters)
  IF identifier ~ '^[0-9A-F]{12}$' THEN
    RETURN TRUE;
  END IF;

  -- Check for non-normalized MAC address patterns
  IF fn_is_valid_mac_address(identifier) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Add comments to functions
COMMENT ON FUNCTION fn_is_valid_mac_address(TEXT) IS 'Checks if a string matches MAC address pattern (supports various formats: AA:BB:CC:DD:EE:FF, AA-BB-CC-DD-EE-FF, AABBCCDDEEFF)';
COMMENT ON FUNCTION fn_normalize_device_identifier(TEXT) IS 'Normalizes MAC addresses to uppercase hex without separators. Preserves special identifiers (TEST-, SYSTEM:, VIRTUAL: prefixes) unchanged.';
COMMENT ON FUNCTION fn_is_valid_device_identifier(TEXT) IS 'Validates device identifier format. Accepts normalized MACs (12 hex chars), non-normalized MACs, and special identifiers (TEST-, SYSTEM:, VIRTUAL: prefixes).';

-- ============================================================================
-- STEP 2: Remove duplicate devices
-- ============================================================================

DO $$
DECLARE
  v_duplicate_count INTEGER;
  v_deleted_count INTEGER := 0;
  v_duplicate_record RECORD;
BEGIN
  -- Find and remove duplicate devices
  -- Strategy: Keep devices that are mapped (have site_id), delete unmapped duplicates

  RAISE NOTICE '--- Checking for duplicate device identifiers ---';

  SELECT COUNT(*) INTO v_duplicate_count
  FROM (
    SELECT device_mac, COUNT(*) as cnt
    FROM devices
    GROUP BY device_mac
    HAVING COUNT(*) > 1
  ) dupes;

  RAISE NOTICE 'Found % device_mac values with duplicates', v_duplicate_count;

  IF v_duplicate_count > 0 THEN
    -- For each duplicate set, keep the best one and delete others
    FOR v_duplicate_record IN
      SELECT device_mac, COUNT(*) as cnt
      FROM devices
      GROUP BY device_mac
      HAVING COUNT(*) > 1
    LOOP
      RAISE NOTICE 'Processing duplicates for device_mac: % (% total records)',
        v_duplicate_record.device_mac, v_duplicate_record.cnt;

      -- Delete duplicates, keeping the best record
      -- Priority: mapped (has site_id) > has program_id > most recent created_at
      WITH ranked_devices AS (
        SELECT
          device_id,
          device_mac,
          ROW_NUMBER() OVER (
            PARTITION BY device_mac
            ORDER BY
              (CASE WHEN site_id IS NOT NULL THEN 1 ELSE 2 END),
              (CASE WHEN program_id IS NOT NULL THEN 1 ELSE 2 END),
              created_at DESC
          ) as rn
        FROM devices
        WHERE device_mac = v_duplicate_record.device_mac
      )
      DELETE FROM devices
      WHERE device_id IN (
        SELECT device_id
        FROM ranked_devices
        WHERE rn > 1
      );

      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      RAISE NOTICE 'Deleted % duplicate records for device_mac: %',
        v_deleted_count, v_duplicate_record.device_mac;
    END LOOP;
  ELSE
    RAISE NOTICE 'No duplicate devices found';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Normalize all MAC addresses
-- ============================================================================

DO $$
DECLARE
  v_update_count INTEGER := 0;
  v_device_record RECORD;
  v_normalized TEXT;
BEGIN
  RAISE NOTICE '--- Normalizing device identifiers ---';

  -- Process each device
  FOR v_device_record IN
    SELECT device_id, device_mac
    FROM devices
    ORDER BY created_at
  LOOP
    v_normalized := fn_normalize_device_identifier(v_device_record.device_mac);

    -- Only update if normalization changed the value
    IF v_normalized IS DISTINCT FROM v_device_record.device_mac THEN
      UPDATE devices
      SET device_mac = v_normalized
      WHERE device_id = v_device_record.device_id;

      v_update_count := v_update_count + 1;

      RAISE NOTICE 'Normalized: % → %',
        v_device_record.device_mac, v_normalized;
    END IF;
  END LOOP;

  RAISE NOTICE 'Normalized % device identifiers', v_update_count;
END $$;

-- ============================================================================
-- STEP 4: Add check constraint
-- ============================================================================

-- Drop existing constraint if it exists
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_device_mac_format_check;

-- Add flexible check constraint that accepts both normalized MACs and special identifiers
ALTER TABLE devices
ADD CONSTRAINT devices_device_mac_format_check
CHECK (fn_is_valid_device_identifier(device_mac));

COMMENT ON CONSTRAINT devices_device_mac_format_check ON devices IS
  'Ensures device_mac is either a valid MAC address (12 hex characters, case-insensitive) or a special identifier (TEST-, SYSTEM:, VIRTUAL: prefix)';

-- ============================================================================
-- STEP 5: Update column documentation
-- ============================================================================

COMMENT ON COLUMN devices.device_mac IS
  'Device identifier - either a normalized MAC address (12 uppercase hex characters, e.g., 98A316F82928) or a special identifier with prefix TEST-, SYSTEM:, or VIRTUAL: (e.g., TEST-ESP32-002, SYSTEM:AUTO:GENERATED, VIRTUAL:SIMULATOR:001)';

-- ============================================================================
-- STEP 6: Verification and summary
-- ============================================================================

DO $$
DECLARE
  v_total_devices INTEGER;
  v_mac_devices INTEGER;
  v_test_devices INTEGER;
  v_system_devices INTEGER;
  v_virtual_devices INTEGER;
  v_other_devices INTEGER;
  v_invalid_devices INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '======================================================';
  RAISE NOTICE '         DEVICE IDENTIFIER NORMALIZATION SUMMARY      ';
  RAISE NOTICE '======================================================';
  RAISE NOTICE '';

  -- Count total devices
  SELECT COUNT(*) INTO v_total_devices FROM devices;

  -- Count by type
  SELECT COUNT(*) INTO v_mac_devices
  FROM devices
  WHERE device_mac ~ '^[0-9A-F]{12}$';

  SELECT COUNT(*) INTO v_test_devices
  FROM devices
  WHERE device_mac ~ '^TEST-';

  SELECT COUNT(*) INTO v_system_devices
  FROM devices
  WHERE device_mac ~ '^SYSTEM:';

  SELECT COUNT(*) INTO v_virtual_devices
  FROM devices
  WHERE device_mac ~ '^VIRTUAL:';

  SELECT COUNT(*) INTO v_other_devices
  FROM devices
  WHERE NOT (
    device_mac ~ '^[0-9A-F]{12}$'
    OR device_mac ~ '^TEST-'
    OR device_mac ~ '^SYSTEM:'
    OR device_mac ~ '^VIRTUAL:'
  );

  -- Check for invalid identifiers
  SELECT COUNT(*) INTO v_invalid_devices
  FROM devices
  WHERE NOT fn_is_valid_device_identifier(device_mac);

  RAISE NOTICE 'Total Devices: %', v_total_devices;
  RAISE NOTICE '';
  RAISE NOTICE 'Device Types:';
  RAISE NOTICE '  - Normalized MAC Addresses: %', v_mac_devices;
  RAISE NOTICE '  - TEST- Identifiers: %', v_test_devices;
  RAISE NOTICE '  - SYSTEM: Identifiers: %', v_system_devices;
  RAISE NOTICE '  - VIRTUAL: Identifiers: %', v_virtual_devices;
  RAISE NOTICE '  - Other Identifiers: %', v_other_devices;
  RAISE NOTICE '';

  IF v_invalid_devices > 0 THEN
    RAISE WARNING 'Found % devices with invalid identifiers!', v_invalid_devices;

    -- Show invalid devices
    RAISE NOTICE 'Invalid device identifiers:';
    FOR v_device_record IN
      SELECT device_id, device_mac
      FROM devices
      WHERE NOT fn_is_valid_device_identifier(device_mac)
      LIMIT 10
    LOOP
      RAISE NOTICE '  - Device ID: %, MAC: %',
        v_device_record.device_id, v_device_record.device_mac;
    END LOOP;
  ELSE
    RAISE NOTICE 'All device identifiers are valid!';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '======================================================';
  RAISE NOTICE '                  MIGRATION COMPLETE                  ';
  RAISE NOTICE '======================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  ✓ Created validation functions';
  RAISE NOTICE '  ✓ Removed duplicate devices';
  RAISE NOTICE '  ✓ Normalized MAC addresses';
  RAISE NOTICE '  ✓ Preserved special identifiers';
  RAISE NOTICE '  ✓ Added check constraint';
  RAISE NOTICE '  ✓ Updated column documentation';
  RAISE NOTICE '';

  -- Sample devices (show a few examples)
  RAISE NOTICE 'Sample Devices:';
  FOR v_device_record IN
    SELECT
      device_mac,
      CASE
        WHEN device_mac ~ '^[0-9A-F]{12}$' THEN 'MAC'
        WHEN device_mac ~ '^TEST-' THEN 'TEST'
        WHEN device_mac ~ '^SYSTEM:' THEN 'SYSTEM'
        WHEN device_mac ~ '^VIRTUAL:' THEN 'VIRTUAL'
        ELSE 'OTHER'
      END as type
    FROM devices
    ORDER BY
      CASE
        WHEN device_mac ~ '^[0-9A-F]{12}$' THEN 1
        WHEN device_mac ~ '^TEST-' THEN 2
        WHEN device_mac ~ '^SYSTEM:' THEN 3
        WHEN device_mac ~ '^VIRTUAL:' THEN 4
        ELSE 5
      END,
      device_mac
    LIMIT 10
  LOOP
    RAISE NOTICE '  [%] %',
      LPAD(v_device_record.type, 7), v_device_record.device_mac;
  END LOOP;

END $$;
