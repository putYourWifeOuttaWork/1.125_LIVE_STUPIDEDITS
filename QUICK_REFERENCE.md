# Device Identifier Normalization - Quick Reference

## Apply Migration (Choose One Method)

### Method 1: Supabase CLI (Recommended)
```bash
cd /tmp/cc-agent/51386994/project
supabase db push
```

### Method 2: Direct psql
```bash
psql postgres://[connection-string] -f supabase/migrations/20260103210655_normalize_device_identifiers.sql
```

### Method 3: Supabase Dashboard
1. Copy contents of `supabase/migrations/20260103210655_normalize_device_identifiers.sql`
2. Paste into SQL Editor
3. Execute

## Test After Applying
```bash
psql postgres://[connection-string] -f test_normalize_migration.sql
```

## What Gets Changed

### MAC Addresses (Normalized)
```
Before: 98:A3:16:F8:29:28
After:  98A316F82928

Before: B8-F8-62-F9-CF-B8
After:  B8F862F9CFB8

Before: b8f862f9cfb8
After:  B8F862F9CFB8
```

### Special Identifiers (Preserved)
```
SYSTEM:AUTO:GENERATED → SYSTEM:AUTO:GENERATED ✓
TEST-ESP32-002 → TEST-ESP32-002 ✓
VIRTUAL:SIMULATOR:001 → VIRTUAL:SIMULATOR:001 ✓
```

## Quick Verification
```sql
-- Count by type
SELECT
  SUM(CASE WHEN device_mac ~ '^[0-9A-F]{12}$' THEN 1 ELSE 0 END) as mac_devices,
  SUM(CASE WHEN device_mac ~ '^TEST-' THEN 1 ELSE 0 END) as test_devices,
  SUM(CASE WHEN device_mac ~ '^SYSTEM:' THEN 1 ELSE 0 END) as system_devices,
  SUM(CASE WHEN device_mac ~ '^VIRTUAL:' THEN 1 ELSE 0 END) as virtual_devices
FROM devices;

-- Check for invalid (should be 0)
SELECT COUNT(*) FROM devices WHERE NOT fn_is_valid_device_identifier(device_mac);
```

## Rollback (If Needed)
```sql
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_device_mac_format_check;
DROP FUNCTION IF EXISTS fn_is_valid_device_identifier(TEXT);
DROP FUNCTION IF EXISTS fn_normalize_device_identifier(TEXT);
DROP FUNCTION IF EXISTS fn_is_valid_mac_address(TEXT);
```

## Files Created

| File | Purpose | Size |
|------|---------|------|
| `supabase/migrations/20260103210655_normalize_device_identifiers.sql` | Main migration (timestamped) | 12K |
| `normalize_device_identifiers.sql` | Migration copy (reference) | 12K |
| `APPLY_NORMALIZE_MIGRATION.sql` | Quick application script | 1.8K |
| `test_normalize_migration.sql` | Test/verification script | 6.9K |
| `NORMALIZE_MIGRATION_README.md` | Comprehensive documentation | 9.4K |
| `MIGRATION_SUMMARY.md` | Detailed summary | 8.7K |
| `QUICK_REFERENCE.md` | This file | - |

## Functions Added

1. `fn_is_valid_mac_address(TEXT) → BOOLEAN`
   - Checks if string is MAC pattern

2. `fn_normalize_device_identifier(TEXT) → TEXT`
   - Normalizes MACs, preserves special identifiers

3. `fn_is_valid_device_identifier(TEXT) → BOOLEAN`
   - Validates format (MACs or special identifiers)

## Safety Features

- Idempotent (safe to run multiple times)
- Preserves special identifiers
- Only deletes unmapped duplicates
- Adds validation constraint
- Detailed logging
- Rollback available

## Migration ID
`20260103210655_normalize_device_identifiers`

## Status
Ready to apply - Review and execute using preferred method above.
