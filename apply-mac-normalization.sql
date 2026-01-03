/*
  # MAC Address Normalization and Constraint

  1. New Functions
    - `fn_normalize_mac_address` - Normalizes MAC addresses to uppercase without separators

  2. Changes
    - Add check constraint to `devices.device_mac` to enforce normalized format
    - Add comment to document required MAC format

  3. Notes
    - All MAC addresses must be stored as 12 uppercase hexadecimal characters
    - No colons, hyphens, or other separators allowed
    - Example: `98A316F82928` (NOT `98:A3:16:F8:29:28`)
*/

-- Create MAC address normalization function
CREATE OR REPLACE FUNCTION fn_normalize_mac_address(p_mac TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_mac IS NULL THEN
    RETURN NULL;
  END IF;

  -- Remove all common separators (colons, hyphens, spaces) and uppercase
  RETURN UPPER(REGEXP_REPLACE(p_mac, '[:\-\s]', '', 'g'));
END;
$$;

COMMENT ON FUNCTION fn_normalize_mac_address IS
'Normalizes MAC addresses by removing separators and converting to uppercase';

-- Add comment to device_mac column documenting required format
COMMENT ON COLUMN devices.device_mac IS
'MAC address in normalized format: 12 uppercase hexadecimal characters without separators (e.g., 98A316F82928)';

-- Add check constraint to enforce normalized format
-- This ensures all MACs are stored without colons/hyphens and in uppercase
DO $$
BEGIN
  -- Drop constraint if it exists (for re-running migration)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'devices_device_mac_normalized_check'
    AND table_name = 'devices'
  ) THEN
    ALTER TABLE devices DROP CONSTRAINT devices_device_mac_normalized_check;
  END IF;

  -- Add constraint: MAC must equal its normalized form
  ALTER TABLE devices
  ADD CONSTRAINT devices_device_mac_normalized_check
  CHECK (device_mac = fn_normalize_mac_address(device_mac));

  RAISE NOTICE 'Added MAC address normalization constraint to devices table';
END $$;

-- Update existing device_mac values to normalized format
-- This ensures any existing devices with colons/hyphens are normalized
UPDATE devices
SET device_mac = fn_normalize_mac_address(device_mac)
WHERE device_mac != fn_normalize_mac_address(device_mac);
