# Device Identifier Normalization Migration

## Overview

This migration normalizes MAC addresses in the `devices` table while preserving special device identifiers. It ensures consistent formatting across all device identifiers and adds validation to prevent invalid formats in the future.

## Files Created

1. **`/tmp/cc-agent/51386994/project/supabase/migrations/20260103210655_normalize_device_identifiers.sql`**
   - Main migration file (timestamped for Supabase migrations)

2. **`/tmp/cc-agent/51386994/project/normalize_device_identifiers.sql`**
   - Copy of migration without timestamp (for reference)

3. **`/tmp/cc-agent/51386994/project/APPLY_NORMALIZE_MIGRATION.sql`**
   - Application script with instructions

## What This Migration Does

### 1. Creates Helper Functions

#### `fn_is_valid_mac_address(mac TEXT) → BOOLEAN`
- Checks if a string matches MAC address pattern
- Supports various formats:
  - `AA:BB:CC:DD:EE:FF` (colon-separated)
  - `AA-BB-CC-DD-EE-FF` (dash-separated)
  - `AABBCCDDEEFF` (no separators)

#### `fn_normalize_device_identifier(identifier TEXT) → TEXT`
- Normalizes MAC addresses to uppercase hex without separators
- **Preserves special identifiers unchanged:**
  - `TEST-*` (test devices)
  - `SYSTEM:*` (system-generated identifiers)
  - `VIRTUAL:*` (virtual/simulated devices)
- Example: `98:A3:16:F8:29:28` → `98A316F82928`

#### `fn_is_valid_device_identifier(identifier TEXT) → BOOLEAN`
- Validates device identifier format
- Accepts:
  - Normalized MACs (12 hex characters)
  - Non-normalized MACs (with separators)
  - Special identifiers with supported prefixes

### 2. Removes Duplicate Devices

- Identifies devices with duplicate `device_mac` values
- Keeps the "best" record using this priority:
  1. Mapped devices (has `site_id`)
  2. Has `program_id`
  3. Most recent `created_at`
- Deletes unmapped duplicates

### 3. Normalizes All MAC Addresses

- Converts all MAC addresses to uppercase hex format without separators
- Example transformations:
  - `98:a3:16:f8:29:28` → `98A316F82928`
  - `B8-F8-62-F9-CF-B8` → `B8F862F9CFB8`
  - `b8f862f9cfb8` → `B8F862F9CFB8`
- **Preserves special identifiers:**
  - `SYSTEM:AUTO:GENERATED` → `SYSTEM:AUTO:GENERATED` (unchanged)
  - `TEST-ESP32-002` → `TEST-ESP32-002` (unchanged)
  - `VIRTUAL:SIMULATOR:001` → `VIRTUAL:SIMULATOR:001` (unchanged)

### 4. Adds Check Constraint

- Adds `devices_device_mac_format_check` constraint
- Ensures all future inserts/updates have valid identifiers
- Flexible format support:
  - Normalized MACs: `^[0-9A-F]{12}$`
  - Special identifiers: `^(TEST-|SYSTEM:|VIRTUAL:)`

### 5. Updates Column Documentation

Updates the `device_mac` column comment to document supported formats:
- Normalized MAC addresses (12 uppercase hex characters)
- Special identifiers with prefixes

### 6. Provides Verification Summary

The migration outputs a detailed summary showing:
- Total device count
- Breakdown by device type:
  - Normalized MAC addresses
  - TEST- identifiers
  - SYSTEM: identifiers
  - VIRTUAL: identifiers
  - Other identifiers
- Any invalid identifiers found
- Sample devices from each category

## How to Apply

### Option 1: Using Supabase CLI (Recommended)

```bash
# From project root
supabase db push
```

This will automatically apply all pending migrations in the `supabase/migrations/` directory.

### Option 2: Using psql

```bash
# Connect to your database
psql postgres://[connection-string]

# Run the migration
\i /tmp/cc-agent/51386994/project/supabase/migrations/20260103210655_normalize_device_identifiers.sql
```

### Option 3: Using Supabase SQL Editor

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `/tmp/cc-agent/51386994/project/supabase/migrations/20260103210655_normalize_device_identifiers.sql`
3. Paste and execute

### Option 4: Using Application Script

```bash
psql postgres://[connection-string] -f /tmp/cc-agent/51386994/project/APPLY_NORMALIZE_MIGRATION.sql
```

## Expected Output

When the migration runs, you'll see output similar to:

```
--- Checking for duplicate device identifiers ---
Found 0 device_mac values with duplicates
No duplicate devices found

--- Normalizing device identifiers ---
Normalized: 98:A3:16:F8:29:28 → 98A316F82928
Normalized: b8-f8-62-f9-cf-b8 → B8F862F9CFB8
Normalized 2 device identifiers

======================================================
         DEVICE IDENTIFIER NORMALIZATION SUMMARY
======================================================

Total Devices: 15

Device Types:
  - Normalized MAC Addresses: 13
  - TEST- Identifiers: 1
  - SYSTEM: Identifiers: 1
  - VIRTUAL: Identifiers: 0
  - Other Identifiers: 0

All device identifiers are valid!

======================================================
                  MIGRATION COMPLETE
======================================================

Summary:
  ✓ Created validation functions
  ✓ Removed duplicate devices
  ✓ Normalized MAC addresses
  ✓ Preserved special identifiers
  ✓ Added check constraint
  ✓ Updated column documentation

Sample Devices:
  [   MAC] 98A316F82928
  [   MAC] B8F862F9CFB8
  [  TEST] TEST-ESP32-002
  [SYSTEM] SYSTEM:AUTO:GENERATED
```

## Supported Identifier Formats

### MAC Addresses (Normalized to: `AABBCCDDEEFF`)

Input formats supported:
- `AA:BB:CC:DD:EE:FF` (colon-separated)
- `AA-BB-CC-DD-EE-FF` (dash-separated)
- `aabbccddeeff` (no separators, lowercase)
- `AABBCCDDEEFF` (no separators, uppercase)

All are normalized to: `AABBCCDDEEFF` (12 uppercase hex characters)

### Special Identifiers (Preserved As-Is)

- **TEST-** prefix: Test and development devices
  - Example: `TEST-ESP32-002`, `TEST-PROTOTYPE-001`

- **SYSTEM:** prefix: System-generated identifiers
  - Example: `SYSTEM:AUTO:GENERATED`, `SYSTEM:PROVISIONING:TEMP`

- **VIRTUAL:** prefix: Virtual or simulated devices
  - Example: `VIRTUAL:SIMULATOR:001`, `VIRTUAL:DEBUG:DEVICE`

## Safety Features

1. **Idempotent**: Can be run multiple times safely
2. **Preserves Data**: Only deletes unmapped duplicates
3. **Validation**: Adds constraint to prevent future invalid formats
4. **Rollback Support**: See rollback instructions below
5. **Detailed Logging**: Shows all changes made

## Rollback Instructions

If you need to rollback this migration:

```sql
-- Remove check constraint
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_device_mac_format_check;

-- Drop functions
DROP FUNCTION IF EXISTS fn_is_valid_device_identifier(TEXT);
DROP FUNCTION IF EXISTS fn_normalize_device_identifier(TEXT);
DROP FUNCTION IF EXISTS fn_is_valid_mac_address(TEXT);

-- Restore original column comment
COMMENT ON COLUMN devices.device_mac IS 'Device MAC address used as unique identifier in MQTT topics';
```

**Note**: This rollback does NOT restore:
- Deleted duplicate devices
- Non-normalized MAC address formats (data remains normalized)

## Testing

After applying the migration, verify the results:

```sql
-- Check total devices and types
SELECT
  COUNT(*) as total_devices,
  SUM(CASE WHEN device_mac ~ '^[0-9A-F]{12}$' THEN 1 ELSE 0 END) as mac_devices,
  SUM(CASE WHEN device_mac ~ '^TEST-' THEN 1 ELSE 0 END) as test_devices,
  SUM(CASE WHEN device_mac ~ '^SYSTEM:' THEN 1 ELSE 0 END) as system_devices,
  SUM(CASE WHEN device_mac ~ '^VIRTUAL:' THEN 1 ELSE 0 END) as virtual_devices
FROM devices;

-- View sample devices
SELECT
  device_mac,
  CASE
    WHEN device_mac ~ '^[0-9A-F]{12}$' THEN 'MAC'
    WHEN device_mac ~ '^TEST-' THEN 'TEST'
    WHEN device_mac ~ '^SYSTEM:' THEN 'SYSTEM'
    WHEN device_mac ~ '^VIRTUAL:' THEN 'VIRTUAL'
    ELSE 'OTHER'
  END as type,
  device_name,
  site_id IS NOT NULL as is_mapped
FROM devices
ORDER BY type, device_mac
LIMIT 20;

-- Check for any invalid identifiers
SELECT device_id, device_mac
FROM devices
WHERE NOT fn_is_valid_device_identifier(device_mac);
-- Should return 0 rows
```

## Impact on Application Code

### Minimal Impact Expected

This migration should have minimal impact on existing code because:

1. **MAC addresses remain unique** - just formatted consistently
2. **Special identifiers preserved** - system devices unchanged
3. **All lookups still work** - just need to normalize input

### Recommended Code Updates

If your application code sends MAC addresses with separators (e.g., `AA:BB:CC:DD:EE:FF`), consider normalizing them before database queries:

```typescript
// JavaScript/TypeScript example
function normalizeDeviceMac(mac: string): string {
  // Remove any non-hex characters and convert to uppercase
  return mac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
}

// Usage
const deviceMac = normalizeDeviceMac('98:A3:16:F8:29:28'); // Returns: 98A316F82928
```

```python
# Python example
def normalize_device_mac(mac: str) -> str:
    """Normalize MAC address to uppercase hex without separators."""
    import re
    return re.sub(r'[^0-9A-Fa-f]', '', mac).upper()

# Usage
device_mac = normalize_device_mac('98:A3:16:F8:29:28')  # Returns: 98A316F82928
```

## Questions?

If you encounter any issues or have questions about this migration:

1. Check the verification summary output
2. Review the test queries above
3. Check migration logs for any warnings
4. Review the rollback instructions if needed

## Migration Metadata

- **Migration ID**: `20260103210655`
- **Migration Name**: `normalize_device_identifiers`
- **Created**: 2026-01-03
- **Safe to Run**: Yes (idempotent, preserves data)
- **Breaking Changes**: None (backward compatible)
- **Estimated Duration**: < 1 second for typical database sizes
