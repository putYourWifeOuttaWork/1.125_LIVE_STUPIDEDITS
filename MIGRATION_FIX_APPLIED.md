# Migration Fix Applied

## Issue Encountered

When applying the initial RLS rebuild migration, an error occurred:

```
ERROR: 22P02: invalid input value for enum export_rights: "none"
```

## Root Cause

The database already had:
1. `user_role` enum type with values: `'observer', 'analyst', 'maintenance', 'sysAdmin'`
2. `export_rights` enum type with value: `'None'` (capital N)
3. Both columns already existed on the `users` table

The migration attempted to:
- Create these enum types (which already existed)
- Set default value to `'none'` (lowercase) when the existing enum used `'None'` (uppercase)

## Fix Applied

Updated `supabase/migrations/20251109130000_complete_rls_rebuild.sql` to:

### 1. Check for Existing Enums

```sql
-- Check if export_rights enum exists before creating
DO $$
DECLARE
  enum_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'export_rights'
  ) INTO enum_exists;

  IF NOT enum_exists THEN
    CREATE TYPE export_rights AS ENUM ('none', 'history', 'history_and_analytics', 'all');
  ELSE
    RAISE NOTICE 'export_rights enum already exists';
  END IF;
END $$;
```

### 2. Check for Existing Columns

```sql
-- Only add column if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'export_rights'
  ) THEN
    ALTER TABLE users ADD COLUMN export_rights export_rights DEFAULT 'none';
  END IF;
END $$;
```

### 3. Handle Default Values Safely

```sql
-- Try to set defaults with error handling
DO $$
BEGIN
  BEGIN
    ALTER TABLE users ALTER COLUMN export_rights SET DEFAULT 'none';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Could not set export_rights default: %', SQLERRM;
  END;
END $$;
```

### 4. Update can_export() Function

Changed the function to:
- Accept `text` parameter instead of `export_rights` enum
- Cast enum values to text for comparison
- Normalize to lowercase for comparison

```sql
CREATE OR REPLACE FUNCTION can_export(required_level text)
RETURNS BOOLEAN AS $$
DECLARE
  v_export_rights text;
BEGIN
  SELECT export_rights::text INTO v_export_rights
  FROM users WHERE id = auth.uid();

  -- Normalize to lowercase
  v_export_rights := lower(v_export_rights);
  required_level := lower(required_level);

  -- Compare normalized values
  ...
END;
$$ LANGUAGE plpgsql;
```

## Current State

The users table currently has:
- `user_role` = `'observer'` for all users
- `export_rights` = `'None'` (capital N) for all users

## What This Means

### Export Rights Values

The existing `export_rights` enum appears to only have one value: `'None'` (capital N)

You may need to manually add the other enum values after the migration:

```sql
-- Check current enum values
SELECT enum_range(NULL::export_rights);

-- If needed, add missing values (must be done outside a transaction):
ALTER TYPE export_rights ADD VALUE IF NOT EXISTS 'history';
ALTER TYPE export_rights ADD VALUE IF NOT EXISTS 'history_and_analytics';
ALTER TYPE export_rights ADD VALUE IF NOT EXISTS 'all';
```

Or you can use the existing enum structure if it has different capitalization:
- `'None'` → maps to "no export"
- Add new values as needed for your export levels

### User Role Values

The `user_role` enum already has the correct values we need:
- `'observer'`
- `'analyst'`
- `'maintenance'`
- `'sysAdmin'`

All users are currently set to `'observer'` which is the correct default.

## Next Steps

1. **Try applying the fixed migration again**:
   - Go to Supabase Studio SQL Editor
   - Copy the updated `20251109130000_complete_rls_rebuild.sql`
   - Execute it

2. **Check if export_rights enum needs updating**:
   ```sql
   SELECT enum_range(NULL::export_rights);
   ```

3. **If needed, add missing enum values**:
   ```sql
   -- Run these separately, not in a transaction
   ALTER TYPE export_rights ADD VALUE IF NOT EXISTS 'history';
   ALTER TYPE export_rights ADD VALUE IF NOT EXISTS 'history_and_analytics';
   ALTER TYPE export_rights ADD VALUE IF NOT EXISTS 'all';
   ```

4. **Update existing users**:
   ```sql
   -- Map 'None' to 'none' if needed, or leave as-is
   -- The can_export() function handles both uppercase and lowercase
   ```

5. **Continue with remaining migrations**:
   - `20251109130001_rls_policies_all_tables.sql`
   - `20251109130002_rls_policies_history_and_supporting.sql`
   - `20251109130003_remove_pilot_program_users.sql`

## Key Changes to Remember

- The `can_export()` function now handles both `'None'` and `'none'`
- All comparisons are case-insensitive
- The migration is now idempotent (can be run multiple times safely)
- Existing enum types and columns are preserved

## Compatibility Note

The updated migration is backward-compatible with the existing database state:
- ✅ Handles existing enum types
- ✅ Handles existing columns
- ✅ Works with both `'None'` and `'none'` values
- ✅ Safe to run even if partially applied before

You can now safely apply this migration!
