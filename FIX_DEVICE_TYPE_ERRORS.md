# Fix device_type Column Errors - APPLY THESE MIGRATIONS

## Problem
Several database functions reference columns that don't exist in the `devices` table:
- ❌ `device_type` - doesn't exist (use `hardware_version` instead)
- ❌ `status` - doesn't exist (use `provisioning_status` instead)
- ❌ `battery_level` - doesn't exist (use `battery_health_percent` instead)

## Affected Functions
1. `fn_generate_mock_unmapped_device()` - ✅ Fixed in migration 130001
2. `get_unassigned_devices()` - ❌ Needs migration 130002
3. `get_device_pool_stats()` - ❌ Needs migration 130002

## Solution - Apply These 2 Migrations

### Migration 1: Fix Mock Device Generator (ALREADY APPLIED ✅)
**File**: `supabase/migrations/20251111130001_fix_mock_generator_device_type.sql`

This fixed the mock device creation function. Status: **COMPLETE**

### Migration 2: Fix Device Pool Functions (APPLY NOW)
**File**: `supabase/migrations/20251111130002_fix_device_pool_functions.sql`

**What it fixes:**
- `get_unassigned_devices()` - Used by Device Pool page
- `get_device_pool_stats()` - Used for device pool statistics

**How to apply:**
1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new
2. Copy the entire contents of `20251111130002_fix_device_pool_functions.sql`
3. Paste and click "Run"

---

## Quick Apply - Copy This SQL

```sql
/*
  # Fix Device Pool Functions - Remove Non-Existent Columns
*/

-- ==========================================
-- Fix get_unassigned_devices Function
-- ==========================================

CREATE OR REPLACE FUNCTION get_unassigned_devices()
RETURNS TABLE (
  device_id uuid,
  device_code text,
  device_name text,
  hardware_version text,
  provisioning_status text,
  last_seen_at timestamptz,
  created_at timestamptz,
  firmware_version text,
  battery_health_percent integer,
  battery_voltage numeric,
  wifi_ssid text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_super_admin boolean;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user is super admin
  SELECT is_super_admin INTO v_is_super_admin
  FROM users
  WHERE id = auth.uid();

  IF NOT v_is_super_admin THEN
    RAISE EXCEPTION 'Access denied. Only super admins can view unassigned devices.';
  END IF;

  -- Return unassigned devices (company_id IS NULL)
  RETURN QUERY
  SELECT
    d.device_id,
    d.device_code,
    d.device_name,
    d.hardware_version,
    d.provisioning_status,
    d.last_seen_at,
    d.created_at,
    d.firmware_version,
    d.battery_health_percent,
    d.battery_voltage,
    d.wifi_ssid
  FROM devices d
  WHERE d.company_id IS NULL
    AND d.is_active = true
  ORDER BY d.created_at DESC;
END;
$$;

-- ==========================================
-- Fix get_device_pool_stats Function
-- ==========================================

CREATE OR REPLACE FUNCTION get_device_pool_stats()
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_super_admin boolean;
  v_total_unassigned integer;
  v_pending_mapping integer;
  v_active integer;
  v_inactive integer;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user is super admin
  SELECT is_super_admin INTO v_is_super_admin
  FROM users
  WHERE id = auth.uid();

  IF NOT v_is_super_admin THEN
    RAISE EXCEPTION 'Access denied. Only super admins can view device pool statistics.';
  END IF;

  -- Get statistics
  SELECT COUNT(*) INTO v_total_unassigned
  FROM devices
  WHERE company_id IS NULL;

  SELECT COUNT(*) INTO v_pending_mapping
  FROM devices
  WHERE company_id IS NULL
    AND provisioning_status = 'pending_mapping';

  SELECT COUNT(*) INTO v_active
  FROM devices
  WHERE company_id IS NULL
    AND is_active = true;

  SELECT COUNT(*) INTO v_inactive
  FROM devices
  WHERE company_id IS NULL
    AND is_active = false;

  RETURN jsonb_build_object(
    'total_unassigned', v_total_unassigned,
    'pending_mapping', v_pending_mapping,
    'active', v_active,
    'inactive', v_inactive
  );
END;
$$;
```

---

## After Applying

### Test 1: View Device Pool
1. Navigate to: **Device Pool** page
2. Should see your mock device: **MOCK-DEV-9142**
3. Should show device details without errors

### Test 2: Check Device Details
Your mock device should show:
- Device Code: MOCK-DEV-9142
- Device Name: My Test Device
- Hardware: ESP32-S3
- Status: pending_mapping
- Battery: 70% (3.87V)
- WiFi: TestNetwork-33

### Test 3: Assign Device to Company
1. Click on the device in Device Pool
2. Assign to "Sandhill Growers" company
3. Device should move from pool to company's device registry

---

## Verification

Run this SQL to verify functions are fixed:
```sql
-- Test get_unassigned_devices
SELECT * FROM get_unassigned_devices() LIMIT 5;

-- Test get_device_pool_stats
SELECT * FROM get_device_pool_stats();
```

Expected results:
- ✅ No "column does not exist" errors
- ✅ Shows MOCK-DEV-9142 in results
- ✅ Returns proper device information

---

## Current Status

| Function | Status | Migration |
|----------|--------|-----------|
| fn_generate_mock_unmapped_device | ✅ Fixed | 130001 (applied) |
| get_unassigned_devices | ⏳ Needs fix | 130002 (apply now) |
| get_device_pool_stats | ⏳ Needs fix | 130002 (apply now) |

---

## Next Steps After Applying

1. ✅ Refresh Device Pool page
2. ✅ See MOCK-DEV-9142 appear
3. ✅ Continue with device submission testing
4. ✅ Generate sessions and wake payloads

---

**Apply migration 130002 now to fix the Device Pool page!**
