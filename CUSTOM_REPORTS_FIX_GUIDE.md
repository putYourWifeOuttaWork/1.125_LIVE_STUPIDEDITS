# Custom Reports Foreign Key Fix Guide

## Problem Summary

The custom reports feature is showing console errors and not loading saved reports:

```
Error: "Could not find a relationship between 'custom_reports' and 'created_by_user_id' in the schema cache"
```

## Root Cause

The `custom_reports` table was created with a foreign key constraint that references `auth.users(id)`:

```sql
created_by_user_id UUID NOT NULL REFERENCES auth.users(id)
```

However, Supabase PostgREST cannot properly resolve cross-schema foreign key relationships for automatic joins. When the frontend tries to query:

```javascript
.select('*, created_by:created_by_user_id(id, email, full_name)')
```

PostgREST cannot find the relationship because it's looking in the `public` schema, not the `auth` schema.

## Solution

Change the foreign key to reference `public.users(id)` instead of `auth.users(id)`. This aligns with how other tables in the codebase handle user references (e.g., `devices`, `pilot_programs`, etc.).

## How to Apply the Fix

### Option 1: Using Supabase Dashboard (RECOMMENDED)

1. Open your Supabase Dashboard
2. Navigate to: **SQL Editor** > **New Query**
3. Copy the contents of `FIX_CUSTOM_REPORTS_FOREIGN_KEY.sql`
4. Paste into the SQL Editor
5. Click **Run** to execute
6. Verify the output shows the constraint was created successfully

### Option 2: Using Migration Files

If you prefer to track this as a migration:

1. The SQL is available in: `FIX_CUSTOM_REPORTS_FOREIGN_KEY.sql`
2. Apply it through your migration tool or Supabase CLI

## Verification

After applying the fix:

1. **Check the constraint:**
   - The verification query at the end of the SQL script will show the constraint
   - Should display: `custom_reports.created_by_user_id -> users.id`

2. **Test the frontend:**
   - Go to the Reports page
   - Saved reports should now load without errors
   - Create a new report and verify it saves correctly
   - Check browser console - should be error-free

3. **Test the query:**
   ```javascript
   const { data, error } = await supabase
     .from('custom_reports')
     .select('*, created_by:created_by_user_id(id, email, full_name)')
     .limit(1);

   // Should return data without error
   ```

## What This Changes

### Before:
- `custom_reports.created_by_user_id` → `auth.users.id`
- PostgREST couldn't resolve the relationship
- Frontend queries failed with PGRST200 error

### After:
- `custom_reports.created_by_user_id` → `public.users.id`
- PostgREST can resolve the relationship
- Frontend queries work with automatic joins
- Reports load and save correctly

## Impact

- **No data loss:** Only the constraint is changed, no data is modified
- **No breaking changes:** All existing data remains intact
- **Immediate effect:** PostgREST schema cache is reloaded automatically

## Technical Details

The `public.users` table mirrors `auth.users` with additional columns and is the standard reference point for user relationships in this application. Other tables like `devices`, `submissions`, and `pilot_programs` all reference `users(id)` rather than `auth.users(id)`.

This fix aligns the `custom_reports` table with the established pattern in the codebase.
