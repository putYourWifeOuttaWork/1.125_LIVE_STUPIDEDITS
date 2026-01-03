/*
  # MAC Address Normalization with Duplicate Handling

  1. New Functions
    - `fn_normalize_mac_address` - Normalizes MAC addresses to uppercase without separators

  2. Changes
    - Identifies and removes duplicate devices that will conflict after normalization
    - Normalizes all existing MAC addresses
    - Adds check constraint to enforce format going forward

  3. Duplicate Handling
    - Keeps the device that is mapped (has site_id and program_id)
    - Removes unmapped/pending devices that would become duplicates

  4. Notes
    - All MAC addresses must be stored as 12 uppercase hexadecimal characters
    - No colons, hyphens, or other separators allowed
    - Example: `98A316F82928` (NOT `98:A3:16:F8:29:28`)
*/

-- Step 1: Create MAC address normalization function
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

-- Step 2: Identify potential duplicates after normalization
DO $$
DECLARE
  duplicate_record RECORD;
  normalized_mac TEXT;
  keep_device_id UUID;
  delete_device_id UUID;
BEGIN
  -- Find MACs that will become duplicates after normalization
  FOR duplicate_record IN
    SELECT
      fn_normalize_mac_address(device_mac) as normalized,
      array_agg(device_id ORDER BY
        CASE
          WHEN provisioning_status = 'mapped' AND site_id IS NOT NULL THEN 1
          WHEN provisioning_status = 'pending_mapping' THEN 2
          ELSE 3
        END,
        created_at ASC
      ) as device_ids,
      array_agg(device_mac ORDER BY
        CASE
          WHEN provisioning_status = 'mapped' AND site_id IS NOT NULL THEN 1
          WHEN provisioning_status = 'pending_mapping' THEN 2
          ELSE 3
        END,
        created_at ASC
      ) as original_macs
    FROM devices
    GROUP BY fn_normalize_mac_address(device_mac)
    HAVING COUNT(*) > 1
  LOOP
    normalized_mac := duplicate_record.normalized;

    -- Keep the first device (mapped or oldest), delete the rest
    FOR i IN 2..array_length(duplicate_record.device_ids, 1) LOOP
      delete_device_id := duplicate_record.device_ids[i];

      RAISE NOTICE 'Removing duplicate device: % (MAC: %) - conflicts with normalized MAC: %',
        delete_device_id,
        duplicate_record.original_macs[i],
        normalized_mac;

      -- Delete the duplicate device
      DELETE FROM devices WHERE device_id = delete_device_id;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Duplicate removal complete';
END $$;

-- Step 3: Update existing device_mac values to normalized format
UPDATE devices
SET device_mac = fn_normalize_mac_address(device_mac)
WHERE device_mac != fn_normalize_mac_address(device_mac);

-- Step 4: Add comment to device_mac column
COMMENT ON COLUMN devices.device_mac IS
'MAC address in normalized format: 12 uppercase hexadecimal characters without separators (e.g., 98A316F82928)';

-- Step 5: Add check constraint to enforce normalized format
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

-- Step 6: Verification query - show all normalized MACs
SELECT
  device_id,
  device_mac,
  device_code,
  device_name,
  provisioning_status,
  site_id IS NOT NULL as is_mapped,
  created_at
FROM devices
ORDER BY device_mac, created_at;
