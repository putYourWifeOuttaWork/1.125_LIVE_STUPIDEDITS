# Quick Fix - Audit Logs Empty After Migration

## Problem

After applying the separation migration, audit logs are showing blank because of **varchar to TEXT type mismatch** in column 10 (site_name).

## The Fix

The migration file has been **updated** with proper type casting:
- `s.name::TEXT` (was just `s.name`)
- `d.device_name::TEXT` (was just `d.device_name`)  
- `d.device_mac::TEXT` (was just `d.device_mac`)
- `u.email::TEXT` (was just `u.email`)

All varchar columns from database tables are now explicitly cast to TEXT to match the function signatures.

---

## ⚠️ ACTION REQUIRED ⚠️

**Re-apply the updated migration file:**

```
📁 supabase/migrations/20251108235959_separate_device_and_audit_history.sql
```

---

## Steps to Apply

### 1. Open Supabase Dashboard
- Go to your project
- Click **SQL Editor**

### 2. Run the Updated Migration
- Open `supabase/migrations/20251108235959_separate_device_and_audit_history.sql`
- Copy **ALL** contents (it's been updated!)
- Paste into SQL Editor
- Click **RUN**

### 3. Verify It Works

```bash
node test-updated-migration.mjs
```

**Expected output:**
```
✅ Function working correctly! Rows returned: X

Sample events:
1. Event Type: ProgramUpdate
   Source: program
   Timestamp: 2025-XX-XX...
```

---

## What Was Changed in the Migration

### Before (Broken):
```sql
s.name AS site_name,           -- varchar(100) causing type mismatch
d.device_name,                 -- varchar causing type mismatch
u.email AS user_email          -- varchar causing type mismatch
```

### After (Fixed):
```sql
s.name::TEXT AS site_name,     -- explicitly cast to TEXT
d.device_name::TEXT,           -- explicitly cast to TEXT
u.email::TEXT AS user_email    -- explicitly cast to TEXT
```

---

## Why This Happened

PostgreSQL functions require **exact type matches** between:
1. The declared RETURNS TABLE column types
2. The actual SELECT query column types

The `sites.name` column is `varchar(100)` in the database, but we declared it as `TEXT` in the function signature. While these are similar, PostgreSQL requires explicit casting to match them perfectly.

---

## After Applying

Your audit logs should show:
- ✅ Program creation, updates, deletion events
- ✅ Site creation, updates, deletion events
- ✅ Submission creation and updates
- ✅ User added, removed, role changes
- ✅ Petri/Gasifier observation changes
- ✅ All historical audit trail data

---

## If Still Blank After Fix

If you still see no events after applying the updated migration:

1. **Check the staging table directly:**
   ```sql
   SELECT COUNT(*) FROM pilot_program_history_staging;
   ```
   If this returns 0, the audit triggers might not be working.

2. **Check for a specific program:**
   ```sql
   SELECT * FROM pilot_program_history_staging
   WHERE program_id = 'YOUR_PROGRAM_ID'
   LIMIT 10;
   ```

3. **Verify RLS policies:**
   Make sure authenticated users can access the staging table.

---

## Files Updated

- ✅ `supabase/migrations/20251108235959_separate_device_and_audit_history.sql` - **UPDATED with type casts**
- ✅ `test-updated-migration.mjs` - New test script

---

**Time to fix**: ~2 minutes
**Status**: 🟡 Waiting for updated migration to be applied
**Impact**: Restores full audit log functionality with all historical data

---

## Quick Commands

```bash
# Test after applying migration
node test-updated-migration.mjs

# Build project (should succeed)
npm run build
```

---

**Next Action**: Re-apply the updated migration file with the TEXT casts!
