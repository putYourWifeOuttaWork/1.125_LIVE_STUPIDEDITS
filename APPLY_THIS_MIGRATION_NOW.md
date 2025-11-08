# 🔧 AUDIT LOG FIX - APPLY THIS MIGRATION NOW

## What's Broken

Your program and site audit log pages are showing:
```
Failed to load audit logs
```

## The Fix

I've created a database migration that fixes the broken audit log functions. The migration file is ready to apply.

## ⚠️ ACTION REQUIRED ⚠️

You need to apply this migration file to your Supabase database:

```
📁 File: supabase/migrations/20251108230000_fix_audit_history_rpc_functions.sql
```

## Quick Apply Instructions

### Step 1: Open Supabase Dashboard

1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar

### Step 2: Apply the Migration

1. Open this file: `supabase/migrations/20251108230000_fix_audit_history_rpc_functions.sql`
2. Copy **ALL** the contents (Ctrl+A, Ctrl+C)
3. Paste into the Supabase SQL Editor (Ctrl+V)
4. Click the **RUN** button (or press Ctrl+Enter)

### Step 3: Verify It Worked

Run this command in your project directory:
```bash
node apply-audit-migration.mjs
```

**Expected output:**
```
✅ Function working correctly! Rows returned: X
```

### Step 4: Test in the Application

1. Navigate to a program's audit log page
2. Verify audit events now load successfully
3. Test filtering and CSV export

## What This Migration Does

Fixes three database functions:
1. `get_site_history_with_devices` - Returns site audit logs
2. `get_program_history_with_devices` - Returns program audit logs
3. `export_filtered_audit_history_csv` - Exports audit logs as CSV

## Why It Broke

When device history integration was added, the new RPC functions that combine device events with audit trail events had return type mismatches. The database couldn't return the data because column types didn't match the function signature.

## What I Fixed

- ✅ Corrected return type structures for both functions
- ✅ Added missing fields (object_type, update_type, old_data, new_data)
- ✅ Created the missing CSV export function
- ✅ Improved error messages in the frontend

## Need More Details?

See these files for complete information:
- `AUDIT_LOG_FIX_INSTRUCTIONS.md` - Detailed instructions
- `AUDIT_LOG_FIX_SUMMARY.md` - Technical summary

## Troubleshooting

**If migration fails:**
- Make sure you're using the SQL Editor in Supabase Dashboard
- Verify you have admin access to the database
- Check that previous IoT device migrations were applied

**If audit logs still don't load:**
- Check browser console for the new detailed error messages
- Run `node apply-audit-migration.mjs` to test functions
- Verify `pilot_program_history_staging` table has data

---

**Time to fix:** ~2 minutes
**Risk:** Very low (only fixes broken functionality)
**Impact:** High (restores audit log functionality)

**Status:** 🟡 Waiting for migration to be applied
