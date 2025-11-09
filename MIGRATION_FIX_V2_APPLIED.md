# Migration Fix V2 - Comprehensive Function Cleanup

## Issues Encountered

### Issue 1: Return Type Conflict ❌
```
Error: Failed to run sql query: ERROR: 42P13: cannot change return type of existing function
HINT: Use DROP FUNCTION add_user_to_company(text,uuid) first.
```

**Cause:** Function exists with different return type

### Issue 2: Non-Unique Function Names ❌
```
Error: Failed to run sql query: ERROR: 42725: function name "search_users_by_email" is not unique
HINT: Specify the argument list to select the function unambiguously.
```

**Cause:** Multiple overloaded versions of the same function exist

## Root Cause

Your database has multiple versions of these functions from previous implementations:
- Same function name with different parameter types
- Same function name with different return types
- PostgreSQL function overloading created multiple versions
- Simple `DROP FUNCTION` statements couldn't handle all versions

## Solution V2: Comprehensive Cleanup ✅

The migration now uses a dynamic DROP block that finds and removes ALL versions:

```sql
DO $$
DECLARE
  func_name text;
BEGIN
  -- Find ALL versions of search_users_by_email
  FOR func_name IN
    SELECT oid::regprocedure::text
    FROM pg_proc
    WHERE proname = 'search_users_by_email'
      AND pg_function_is_visible(oid)
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_name || ' CASCADE';
  END LOOP;

  -- Repeat for all 6 functions:
  -- add_user_to_company
  -- remove_user_from_company
  -- get_unassigned_devices
  -- assign_device_to_company
  -- get_device_pool_stats
END $$;
```

### How This Works

1. **Queries System Catalog:** `pg_proc` contains all functions in the database
2. **Gets Full Signatures:** `oid::regprocedure` gives complete function signature
3. **Loops Through All Versions:** Handles overloaded functions automatically
4. **Drops With CASCADE:** Removes all dependencies
5. **Safe:** `IF EXISTS` prevents errors if function doesn't exist

### Why This is Better

- ✅ Handles multiple overloaded versions
- ✅ Works regardless of parameter types
- ✅ Works regardless of return types
- ✅ Removes all dependencies with CASCADE
- ✅ Won't fail on missing functions
- ✅ Truly idempotent - can run multiple times

## How to Apply the Updated Migration

### Step 1: Copy Updated Migration
The migration file has been updated:
```
supabase/migrations/20251109160000_user_management_and_device_pool.sql
```

### Step 2: Apply Via Supabase Dashboard (Recommended)
1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new
2. Open the migration file
3. Copy the ENTIRE contents (including the new DO $$ block)
4. Paste into SQL Editor
5. Click "Run"
6. Wait for "Success. No rows returned"

### Step 3: Verify Functions Created
```sql
SELECT
  routine_name,
  COUNT(*) as version_count
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'search_users_by_email',
    'add_user_to_company',
    'remove_user_from_company',
    'get_unassigned_devices',
    'assign_device_to_company',
    'get_device_pool_stats'
  )
GROUP BY routine_name
ORDER BY routine_name;
```

**Expected Result:** 6 rows, each with `version_count = 1`

## What Changed From V1

| V1 Fix | V2 Fix |
|--------|--------|
| Simple DROP statements | Dynamic function discovery |
| Hardcoded signatures | Queries system catalog |
| Could fail with overloads | Handles all overloads |
| Manual CASCADE | Automatic CASCADE |

## Testing After Migration

### Test 1: User Search
```sql
-- Should return results (as any authenticated user)
SELECT * FROM search_users_by_email('test');
```

### Test 2: Device Pool (Super Admin Only)
```sql
-- Should return unassigned devices
SELECT * FROM get_unassigned_devices();
```

### Test 3: Device Pool Stats (Super Admin Only)
```sql
-- Should return statistics object
SELECT * FROM get_device_pool_stats();
```

## Troubleshooting

### If you still get "function is not unique"
This would be extremely rare with V2, but if it happens:
```sql
-- Manually inspect remaining functions
SELECT oid::regprocedure::text
FROM pg_proc
WHERE proname = 'search_users_by_email';

-- Drop manually
DROP FUNCTION [paste full signature here] CASCADE;
```

### If migration succeeds but functions don't work
Check permissions:
```sql
-- Verify grants
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name IN (
  'search_users_by_email',
  'add_user_to_company',
  'remove_user_from_company'
);
```

## Summary

✅ **Problem:** Multiple function versions blocking migration
✅ **Solution:** Dynamic function discovery and cleanup
✅ **Status:** Migration updated and ready to apply
✅ **Safety:** Fully idempotent, can run multiple times

The migration will now successfully clean up all existing function versions and create the new multi-tenancy functions.
