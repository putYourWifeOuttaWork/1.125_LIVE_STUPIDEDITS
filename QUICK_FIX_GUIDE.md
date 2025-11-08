# Quick Fix for Audit Logs - Updated Instructions

## The Error You Got

```
ERROR: 42P13: cannot change return type of existing function
HINT: Use DROP FUNCTION get_site_history_with_devices(...) first.
```

## ✅ Good News!

I've updated the migration file to fix this. It now drops the old functions before creating the new ones.

## Apply the Updated Migration

### Option 1: Supabase Dashboard (Easiest)

1. **Open Supabase Dashboard**
   - Go to your project
   - Click **SQL Editor** in sidebar

2. **Run the Updated Migration**
   - Copy ALL contents from: `supabase/migrations/20251108230000_fix_audit_history_rpc_functions.sql`
   - Paste into SQL Editor
   - Click **RUN**

3. **Verify Success**
   ```bash
   node apply-audit-migration.mjs
   ```

   Should show: ✅ Function working correctly!

### Option 2: Copy-Paste SQL (Quick)

Run this in Supabase SQL Editor:

```sql
-- Drop existing functions
DROP FUNCTION IF EXISTS get_site_history_with_devices(uuid, timestamptz, timestamptz, text[], device_event_category[], integer);
DROP FUNCTION IF EXISTS get_program_history_with_devices(uuid, timestamptz, timestamptz, text[], device_event_category[], integer);
DROP FUNCTION IF EXISTS export_filtered_audit_history_csv(uuid, uuid, text, text, uuid);
```

Then copy and paste the rest of the migration file.

## What Changed

The migration now includes:
```sql
DROP FUNCTION IF EXISTS get_site_history_with_devices(...);
DROP FUNCTION IF EXISTS get_program_history_with_devices(...);
DROP FUNCTION IF EXISTS export_filtered_audit_history_csv(...);
```

This removes the old broken functions before creating the fixed versions.

## After Applying

1. Test: `node apply-audit-migration.mjs`
2. Check audit logs in your app
3. Enjoy working audit trails!

---

**File to apply**: `supabase/migrations/20251108230000_fix_audit_history_rpc_functions.sql`

**Status**: Updated and ready to apply ✅
