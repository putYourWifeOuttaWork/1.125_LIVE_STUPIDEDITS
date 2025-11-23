# Telemetry Insert Error Diagnosis

## Current Status
- ✅ **Image insert:** WORKING
- ❌ **Telemetry insert:** Still failing with format() error

## Error Details
```
code: '22023',
message: 'unrecognized format() type specifier "."'
hint: 'For a single "%" use "%%".'
```

## What We've Done
1. ✅ Fixed `populate_device_data_company_id()` trigger function
2. ✅ Applied TRY-EXCEPT blocks for missing columns
3. ✅ Verified image insert works (same trigger!)

## Why Telemetry Still Fails

Since device_images uses the SAME trigger and works, but device_telemetry fails, there must be:

1. **Another trigger on device_telemetry** we haven't found
2. **A different code path** in the Edge function
3. **The function wasn't actually updated** (cache issue?)

## Diagnostic Steps

Run these SQL queries in Supabase Dashboard:

### 1. Test Direct Insert
```sql
-- File: test-telemetry-insert-direct.sql
DO $$
DECLARE
  v_device_id UUID;
BEGIN
  SELECT device_id INTO v_device_id
  FROM devices
  WHERE device_mac = 'AA:BB:CC:21:30:20'
  LIMIT 1;

  INSERT INTO device_telemetry (
    device_id,
    captured_at,
    temperature,
    humidity
  ) VALUES (
    v_device_id,
    now(),
    29.9,
    55
  );

  RAISE NOTICE '✅ SUCCESS';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ ERROR: % (STATE: %)', SQLERRM, SQLSTATE;
END $$;
```

### 2. Verify Trigger Function
```sql
-- File: verify-trigger-function-updated.sql
SELECT
  (pg_get_functiondef(p.oid) LIKE '%EXCEPTION WHEN undefined_column%') as has_fix,
  (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), 'EXCEPTION WHEN undefined_column', ''))) / 28 as exception_count
FROM pg_proc p
WHERE p.proname = 'populate_device_data_company_id';
```

**Expected:** `has_fix = true`, `exception_count = 4`

### 3. List All Triggers
```sql
-- Find ALL triggers on device_telemetry
SELECT
  t.tgname as trigger_name,
  p.proname as function_name,
  pg_get_triggerdef(t.oid) as definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname = 'device_telemetry'
  AND NOT t.tgisinternal
ORDER BY t.tgname;
```

## Possible Solutions

### If test insert works:
- Issue is in Edge function code path (NOT database)
- Check TypeScript error handling

### If test insert fails with same error:
- There's another trigger we haven't found
- OR the function update didn't apply (try reapplying)

### If exception_count ≠ 4:
- Function update didn't apply properly
- Reapply the SQL fix

## Next Steps

1. Run diagnostic queries above
2. Share results
3. Apply targeted fix based on findings
