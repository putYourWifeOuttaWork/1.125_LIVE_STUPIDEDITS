# Fix audit_log References Migration

## Problem
The `fn_assign_device_to_site()` and `fn_remove_device_from_site()` functions try to INSERT into the `audit_log` table, which doesn't exist. This causes the error:
```
relation "audit_log" does not exist
```

This error prevents wake schedule updates in the device placement modal from working correctly.

## Solution
Remove the audit_log INSERT statements from both functions. The device_history table already logs these changes via triggers, so duplicate logging is not needed.

## How to Apply

### Option 1: Supabase Dashboard (Recommended)

1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql
2. Copy the entire SQL content from `fix_audit_log_references.sql`
3. Paste it into the SQL Editor
4. Click "Run" to execute

### Option 2: Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db execute -f fix_audit_log_references.sql
```

### Option 3: Direct PostgreSQL Connection

If you have direct database access:
```bash
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres" -f fix_audit_log_references.sql
```

## Verification

After applying the migration, test that the functions work:

1. Try assigning a device to a site in the UI
2. Try updating wake schedule in the device placement modal
3. Check that no "audit_log" errors appear in the browser console

## Files
- Migration SQL: `/tmp/cc-agent/51386994/project/fix_audit_log_references.sql`
- Apply script: `/tmp/cc-agent/51386994/project/apply-fix-audit-log-migration.mjs`

## What Changed

### fn_assign_device_to_site
- Removed: INSERT INTO audit_log statement
- Kept: All device assignment logic
- Device history is still logged via triggers

### fn_remove_device_from_site
- Removed: INSERT INTO audit_log statement
- Kept: All device removal logic
- Device history is still logged via triggers
