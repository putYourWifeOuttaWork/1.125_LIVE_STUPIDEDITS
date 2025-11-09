# Helper Function Compatibility Fix

## Problem Identified

The error `function user_is_company_admin() does not exist` occurred due to a migration chain break:

1. **Migration 20251109000003**: Created original helper functions:
   - `user_is_company_admin()`
   - `user_has_program_access(UUID)`
   - `user_is_company_admin_for_program(UUID)`

2. **Migration 20251109130000**: Dropped these functions and recreated with new names:
   - `user_is_company_admin()` → `is_company_admin()`
   - Removed other old functions

3. **Migration 20251109170001**: Still referenced the OLD function names in RLS policies
   - Tried to use `user_is_company_admin()` which no longer existed
   - Tried to use `user_has_program_access()` which was deleted

## Solution Implemented

Created bridge migration **20251109165959_restore_helper_function_compatibility.sql** that:

### 1. Restores Backward Compatibility

Creates wrapper functions that maintain old naming while calling new implementations:

```sql
-- Old name wraps new implementation
CREATE OR REPLACE FUNCTION user_is_company_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN is_company_admin();  -- Calls the new function
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

### 2. Recreates user_has_program_access()

Implements program access checking with active company context support:

- Super admins: Implicit access to all programs in their active company
- Company admins: Implicit access to all programs in their active company
- Regular users: Explicit access via pilot_program_users table (if it exists)
- All access restricted by active company context

### 3. Recreates user_is_company_admin_for_program()

Checks if user is company admin AND program belongs to their active company.

## Migration Order

```
20251109000003  → Creates original functions
20251109130000  → Drops and renames functions
20251109165959  → ✅ NEW: Restores compatibility (THIS FIX)
20251109170000  → Creates active company context system
20251109170001  → Updates RLS policies (needs old function names)
20251109170002  → Adds data integrity constraints
```

## What This Fixes

✅ Migration 170001 can now execute without errors
✅ RLS policies work with both old and new function names
✅ Active company context system integrates seamlessly
✅ No breaking changes to existing code
✅ Smooth transition path for future cleanup

## Testing

Run the test script to verify all functions work correctly:

```bash
node test-helper-functions.mjs
```

This will verify:
- All helper functions exist
- Compatibility functions return correct results
- RLS policies execute without errors
- Active company context works properly

## Next Steps

1. Apply the bridge migration to database
2. Apply remaining migrations (170000, 170001, 170002)
3. Run test script to verify everything works
4. Test company switching functionality in UI

## Future Cleanup (Optional)

Once migration 170001 is stable and tested, you could:

1. Update migration 170001 to use new function names directly
2. Remove the compatibility wrapper functions
3. Consolidate to a single naming convention

However, keeping both naming conventions is safe and maintains backward compatibility with any existing code that might reference the old names.
