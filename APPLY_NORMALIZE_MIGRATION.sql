/*
  # Apply Device Identifier Normalization Migration

  This script applies the device MAC address normalization migration.

  INSTRUCTIONS:
  1. Review the migration in: supabase/migrations/20260103210655_normalize_device_identifiers.sql
  2. Apply via Supabase CLI: supabase db push
  3. Or apply directly via psql or Supabase SQL editor

  WHAT THIS MIGRATION DOES:
  - Creates fn_is_valid_mac_address() - checks if string is MAC pattern
  - Creates fn_normalize_device_identifier() - normalizes MACs, preserves special identifiers
  - Creates fn_is_valid_device_identifier() - validates format
  - Removes duplicate devices (keeps mapped devices, deletes unmapped duplicates)
  - Normalizes all MAC addresses (e.g., 98:A3:16:F8:29:28 → 98A316F82928)
  - Keeps special identifiers unchanged (TEST-ESP32-002, SYSTEM:AUTO:GENERATED, etc.)
  - Adds flexible check constraint allowing both normalized MACs and special identifiers
  - Adds column documentation explaining supported formats
  - Shows verification summary of device types

  SAFE TO RUN:
  - Idempotent (can be run multiple times)
  - Preserves special identifiers
  - Only deletes unmapped duplicate devices
  - Includes rollback instructions below
*/

-- Execute the migration
\i supabase/migrations/20260103210655_normalize_device_identifiers.sql

/*
  ROLLBACK INSTRUCTIONS (if needed):

  -- Remove check constraint
  ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_device_mac_format_check;

  -- Drop functions
  DROP FUNCTION IF EXISTS fn_is_valid_device_identifier(TEXT);
  DROP FUNCTION IF EXISTS fn_normalize_device_identifier(TEXT);
  DROP FUNCTION IF EXISTS fn_is_valid_mac_address(TEXT);

  -- Restore original column comment
  COMMENT ON COLUMN devices.device_mac IS 'Device MAC address used as unique identifier in MQTT topics';
*/
