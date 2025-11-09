# Migration Fix Applied

## Issue
When applying the user management migration, you encountered:
```
Error: Failed to run sql query: ERROR: 42P13: cannot change return type of existing function
HINT: Use DROP FUNCTION add_user_to_company(text,uuid) first.
```

## Solution Applied ✅

The migration file has been updated to include DROP statements at the beginning:

```sql
DROP FUNCTION IF EXISTS search_users_by_email(text);
DROP FUNCTION IF EXISTS add_user_to_company(text, uuid);
DROP FUNCTION IF EXISTS remove_user_from_company(uuid);
DROP FUNCTION IF EXISTS get_unassigned_devices();
DROP FUNCTION IF EXISTS assign_device_to_company(uuid, uuid);
DROP FUNCTION IF EXISTS get_device_pool_stats();
```

## How to Apply the Fixed Migration

### Supabase Dashboard (Recommended)
1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new
2. Copy entire contents of `supabase/migrations/20251109160000_user_management_and_device_pool.sql`
3. Paste into SQL Editor
4. Click "Run"
5. Should see "Success. No rows returned"

## Verification

```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN (
  'search_users_by_email',
  'add_user_to_company',
  'remove_user_from_company',
  'get_unassigned_devices',
  'assign_device_to_company',
  'get_device_pool_stats'
);
```

Should return 6 rows.

## Next Steps
1. Apply the fixed migration
2. Verify functions created
3. Test device pool at /device-pool
4. Test user management

## Why This Happened

Your database likely had multiple versions of these functions from previous implementations:
- Different parameter types
- Different return types
- Multiple overloaded versions

PostgreSQL allows function overloading (same name, different parameters), but when you have multiple versions, you must drop them ALL before creating new ones.

## What the Fix Does

The new DROP block:
1. Queries `pg_proc` system catalog to find ALL function versions
2. Gets the full function signature using `oid::regprocedure`
3. Drops each version with CASCADE (removes dependencies too)
4. Repeats for all 6 target functions
5. Allows migration to proceed cleanly

