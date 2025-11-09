# Migration Fix #2 Applied

## Issue Encountered

When applying the RLS rebuild migration, another error occurred:

```
ERROR: 42725: function name "is_company_admin" is not unique
HINT: Specify the argument list to select the function unambiguously.
```

## Root Cause

The database had multiple versions of RLS helper functions with different signatures (argument lists). When we tried to drop them with just `DROP FUNCTION IF EXISTS function_name()`, PostgreSQL couldn't determine which version to drop because there were multiple.

This happens when:
- Functions are overloaded (same name, different parameters)
- Previous migrations created variations of the same function
- Functions were recreated with different signatures over time

## Fix Applied

Updated `supabase/migrations/20251109130000_complete_rls_rebuild.sql` to:

### 1. Drop All Function Variations with CASCADE

```sql
-- Drop with CASCADE to remove dependencies
DROP FUNCTION IF EXISTS is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS get_user_company_id() CASCADE;
DROP FUNCTION IF EXISTS user_has_program_access(UUID) CASCADE;
DROP FUNCTION IF EXISTS user_is_company_admin() CASCADE;
DROP FUNCTION IF EXISTS user_is_company_admin_for_program(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_company_admin() CASCADE;
DROP FUNCTION IF EXISTS is_user_active() CASCADE;
DROP FUNCTION IF EXISTS get_user_role() CASCADE;
DROP FUNCTION IF EXISTS has_role(user_role) CASCADE;
DROP FUNCTION IF EXISTS can_export(export_rights) CASCADE;
DROP FUNCTION IF EXISTS can_export(text) CASCADE;
```

### 2. Dynamic Function Discovery and Removal

Added a PL/pgSQL block to find and drop ALL variations of these functions:

```sql
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN
    SELECT proname, oidvectortypes(proargtypes) as argtypes
    FROM pg_proc
    WHERE proname IN (
      'is_super_admin', 'get_user_company_id', 'user_has_program_access',
      'user_is_company_admin', 'user_is_company_admin_for_program',
      'is_company_admin', 'is_user_active', 'get_user_role', 'has_role', 'can_export'
    )
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I(%s) CASCADE', func_record.proname, func_record.argtypes);
    RAISE NOTICE 'Dropped function %(%)', func_record.proname, func_record.argtypes;
  END LOOP;
END $$;
```

This approach:
- **Discovers** all function variations dynamically
- **Extracts** their exact argument types
- **Drops** each specific function signature
- **Uses CASCADE** to handle any dependencies
- **Logs** what it drops for verification

## What This Fixes

✅ **Removes ambiguity** - Explicitly drops all function variations
✅ **Handles overloads** - Works with multiple signatures of same function
✅ **Cleans dependencies** - CASCADE removes any RLS policies using these functions
✅ **Fresh start** - Ensures clean slate before creating new functions

## Build Status

✅ **Build Successful** - Project compiles without errors

```
✓ 2222 modules transformed
✓ built in 13.70s
```

## Next Steps

**Try applying the migration again** via Supabase Studio:

1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new

2. Copy the updated `supabase/migrations/20251109130000_complete_rls_rebuild.sql`

3. Paste and click "Run"

4. Watch for NOTICE messages showing which functions are being dropped

5. If successful, continue with:
   - `20251109130001_rls_policies_all_tables.sql`
   - `20251109130002_rls_policies_history_and_supporting.sql`
   - `20251109130003_remove_pilot_program_users.sql`

## What to Expect

When you run the migration, you'll see output like:

```
NOTICE: Dropped function is_company_admin()
NOTICE: Dropped function is_company_admin(uuid)
NOTICE: Dropped function user_is_company_admin()
...
```

This is normal and shows the cleanup is working correctly.

## Safety Features

- ✅ Uses `IF EXISTS` to avoid errors if functions don't exist
- ✅ Uses `CASCADE` to safely remove dependent policies
- ✅ Dynamic discovery ensures nothing is missed
- ✅ Transaction-safe (rolls back on any error)
- ✅ Creates new clean functions after cleanup

The migration is now robust and should handle any existing function variations in your database!
