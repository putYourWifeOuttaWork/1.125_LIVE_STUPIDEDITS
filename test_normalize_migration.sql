/*
  # Test Device Identifier Normalization Migration

  This script tests the normalization functions and demonstrates expected behavior.
  Run this AFTER applying the migration to verify it works correctly.
*/

-- ============================================================================
-- TEST 1: Function Tests
-- ============================================================================

\echo ''
\echo '========================================================'
\echo '  TEST 1: Testing Validation Functions'
\echo '========================================================'
\echo ''

-- Test fn_is_valid_mac_address
\echo 'Testing fn_is_valid_mac_address():'
SELECT
  'AA:BB:CC:DD:EE:FF' as input,
  fn_is_valid_mac_address('AA:BB:CC:DD:EE:FF') as is_valid,
  'Expected: true' as expected
UNION ALL
SELECT
  'AA-BB-CC-DD-EE-FF',
  fn_is_valid_mac_address('AA-BB-CC-DD-EE-FF'),
  'Expected: true'
UNION ALL
SELECT
  'AABBCCDDEEFF',
  fn_is_valid_mac_address('AABBCCDDEEFF'),
  'Expected: true'
UNION ALL
SELECT
  'TEST-ESP32-001',
  fn_is_valid_mac_address('TEST-ESP32-001'),
  'Expected: false'
UNION ALL
SELECT
  'INVALID',
  fn_is_valid_mac_address('INVALID'),
  'Expected: false';

\echo ''
\echo 'Testing fn_normalize_device_identifier():'
SELECT
  '98:a3:16:f8:29:28' as input,
  fn_normalize_device_identifier('98:a3:16:f8:29:28') as normalized,
  '98A316F82928' as expected
UNION ALL
SELECT
  'B8-F8-62-F9-CF-B8',
  fn_normalize_device_identifier('B8-F8-62-F9-CF-B8'),
  'B8F862F9CFB8'
UNION ALL
SELECT
  'b8f862f9cfb8',
  fn_normalize_device_identifier('b8f862f9cfb8'),
  'B8F862F9CFB8'
UNION ALL
SELECT
  'SYSTEM:AUTO:GENERATED',
  fn_normalize_device_identifier('SYSTEM:AUTO:GENERATED'),
  'SYSTEM:AUTO:GENERATED'
UNION ALL
SELECT
  'TEST-ESP32-002',
  fn_normalize_device_identifier('TEST-ESP32-002'),
  'TEST-ESP32-002'
UNION ALL
SELECT
  'VIRTUAL:SIMULATOR:001',
  fn_normalize_device_identifier('VIRTUAL:SIMULATOR:001'),
  'VIRTUAL:SIMULATOR:001';

\echo ''
\echo 'Testing fn_is_valid_device_identifier():'
SELECT
  '98A316F82928' as input,
  fn_is_valid_device_identifier('98A316F82928') as is_valid,
  'Expected: true' as expected
UNION ALL
SELECT
  '98:A3:16:F8:29:28',
  fn_is_valid_device_identifier('98:A3:16:F8:29:28'),
  'Expected: true'
UNION ALL
SELECT
  'TEST-ESP32-001',
  fn_is_valid_device_identifier('TEST-ESP32-001'),
  'Expected: true'
UNION ALL
SELECT
  'SYSTEM:AUTO:GENERATED',
  fn_is_valid_device_identifier('SYSTEM:AUTO:GENERATED'),
  'Expected: true'
UNION ALL
SELECT
  'VIRTUAL:DEBUG',
  fn_is_valid_device_identifier('VIRTUAL:DEBUG'),
  'Expected: true'
UNION ALL
SELECT
  'INVALID_FORMAT',
  fn_is_valid_device_identifier('INVALID_FORMAT'),
  'Expected: false'
UNION ALL
SELECT
  '12345',
  fn_is_valid_device_identifier('12345'),
  'Expected: false';

-- ============================================================================
-- TEST 2: Current Device Summary
-- ============================================================================

\echo ''
\echo '========================================================'
\echo '  TEST 2: Current Device Summary'
\echo '========================================================'
\echo ''

SELECT
  COUNT(*) as total_devices,
  SUM(CASE WHEN device_mac ~ '^[0-9A-F]{12}$' THEN 1 ELSE 0 END) as mac_devices,
  SUM(CASE WHEN device_mac ~ '^TEST-' THEN 1 ELSE 0 END) as test_devices,
  SUM(CASE WHEN device_mac ~ '^SYSTEM:' THEN 1 ELSE 0 END) as system_devices,
  SUM(CASE WHEN device_mac ~ '^VIRTUAL:' THEN 1 ELSE 0 END) as virtual_devices,
  SUM(CASE WHEN NOT (
    device_mac ~ '^[0-9A-F]{12}$' OR
    device_mac ~ '^TEST-' OR
    device_mac ~ '^SYSTEM:' OR
    device_mac ~ '^VIRTUAL:'
  ) THEN 1 ELSE 0 END) as other_devices
FROM devices;

-- ============================================================================
-- TEST 3: Sample Devices by Type
-- ============================================================================

\echo ''
\echo '========================================================'
\echo '  TEST 3: Sample Devices by Type'
\echo '========================================================'
\echo ''

\echo 'MAC Address Devices (normalized):'
SELECT
  device_mac,
  device_name,
  site_id IS NOT NULL as is_mapped,
  created_at::date as created_date
FROM devices
WHERE device_mac ~ '^[0-9A-F]{12}$'
ORDER BY device_mac
LIMIT 5;

\echo ''
\echo 'TEST Devices:'
SELECT
  device_mac,
  device_name,
  site_id IS NOT NULL as is_mapped,
  created_at::date as created_date
FROM devices
WHERE device_mac ~ '^TEST-'
ORDER BY device_mac
LIMIT 5;

\echo ''
\echo 'SYSTEM Devices:'
SELECT
  device_mac,
  device_name,
  site_id IS NOT NULL as is_mapped,
  created_at::date as created_date
FROM devices
WHERE device_mac ~ '^SYSTEM:'
ORDER BY device_mac
LIMIT 5;

\echo ''
\echo 'VIRTUAL Devices:'
SELECT
  device_mac,
  device_name,
  site_id IS NOT NULL as is_mapped,
  created_at::date as created_date
FROM devices
WHERE device_mac ~ '^VIRTUAL:'
ORDER BY device_mac
LIMIT 5;

-- ============================================================================
-- TEST 4: Validation Check
-- ============================================================================

\echo ''
\echo '========================================================'
\echo '  TEST 4: Validation Check'
\echo '========================================================'
\echo ''

\echo 'Checking for invalid device identifiers...'
SELECT
  device_id,
  device_mac,
  'INVALID' as status
FROM devices
WHERE NOT fn_is_valid_device_identifier(device_mac);

\echo ''
\echo 'If no rows returned above, all device identifiers are valid!'

-- ============================================================================
-- TEST 5: Constraint Test (will fail on invalid input)
-- ============================================================================

\echo ''
\echo '========================================================'
\echo '  TEST 5: Constraint Test (Safe to Skip)'
\echo '========================================================'
\echo ''
\echo 'Testing check constraint with valid input...'

-- This should succeed
BEGIN;
  INSERT INTO devices (device_mac, device_name, is_active)
  VALUES ('TEST-CONSTRAINT-001', 'Test Device', false);
  \echo '✓ Valid special identifier accepted'
ROLLBACK;

BEGIN;
  INSERT INTO devices (device_mac, device_name, is_active)
  VALUES ('AABBCCDDEEFF', 'Test MAC Device', false);
  \echo '✓ Valid MAC address accepted'
ROLLBACK;

\echo ''
\echo 'Testing check constraint with invalid input (should fail)...'

-- This should fail
BEGIN;
  INSERT INTO devices (device_mac, device_name, is_active)
  VALUES ('INVALID_FORMAT', 'Invalid Device', false);
  \echo '✗ Invalid format was accepted (UNEXPECTED!)'
ROLLBACK;
-- Expect: ERROR:  new row for relation "devices" violates check constraint "devices_device_mac_format_check"

\echo ''
\echo '========================================================'
\echo '  All Tests Complete'
\echo '========================================================'
\echo ''
