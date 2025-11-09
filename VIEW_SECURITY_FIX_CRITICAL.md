# CRITICAL: View Security Invoker Fix

**Date:** 2025-11-09
**Issue:** Users seeing programs from ALL companies despite RLS policies
**Status:** FIX READY TO APPLY

---

## Problem

**Matt@grmtek.com** is assigned to **GasX company** but seeing **12 Sandhill programs** instead of 0 programs!

### Symptoms
- Console shows: "Initializing active company context for user matt@grmtek.com: 81084842-9381-45e4-a6f3-27f0b6b83897" (GasX)
- Database shows Matt's `active_company_id` = GasX
- UI shows Sandhill programs (wrong company!)
- RLS policies are correctly configured
- Active company context is correctly set

### Root Cause

The **`pilot_programs_with_progress` VIEW** does NOT have `security_invoker = true` set!

When a PostgreSQL view is created without `security_invoker`, it executes with the permissions of the view OWNER (typically postgres or service role), which **BYPASSES ALL RLS POLICIES**.

```sql
-- WRONG (current state):
CREATE VIEW pilot_programs_with_progress AS SELECT...
-- Executes as view owner, bypasses RLS

-- CORRECT (what we need):
CREATE VIEW pilot_programs_with_progress WITH (security_invoker = true) AS SELECT...
-- Executes as calling user, respects RLS
```

---

## Why This Happened

The view was created in an earlier migration (`20250627192318_pale_breeze.sql`) without the security_invoker option. A later migration (`20251109000010_fix_view_security_context.sql`) tried to fix it, but the fix may not have been properly applied to the live database.

---

## The Fix

A new migration has been created:
**`supabase/migrations/20251109230000_fix_view_security_invoker_final.sql`**

This migration:
1. Drops the existing view
2. Recreates it WITH `(security_invoker = true)`
3. Grants proper permissions
4. Adds documentation

---

## How to Apply

### Option 1: Automatic (Preferred)
The migration file has been created and will be applied automatically on next deployment.

###Option 2: Manual (Immediate)
1. Go to Supabase Dashboard > SQL Editor
2. Copy the contents of `FIX_VIEW_SECURITY_NOW.sql`
3. Paste and run
4. Verify with:
   ```sql
   SELECT c.relname AS view_name, c.reloptions AS options
   FROM pg_class c
   WHERE c.relname = 'pilot_programs_with_progress' AND c.relkind = 'v';
   ```
   Should show: `{security_invoker=true}`

---

## Expected Behavior After Fix

### For Matt (GasX company admin):
- **Before fix:** Sees 12 Sandhill programs ❌
- **After fix:** Sees 0 programs ✓ (GasX has no programs)

### For Sandhill Users:
- **Before fix:** Sees 12 Sandhill programs ✓
- **After fix:** Sees 12 Sandhill programs ✓ (no change)

### Testing Steps:
1. Apply the migration
2. Have Matt refresh the browser (hard refresh: Cmd+Shift+R or Ctrl+Shift+R)
3. Clear browser localStorage if needed:
   - Open DevTools > Application > Local Storage > Clear
4. Log out and log back in
5. Verify Matt sees 0 programs
6. Verify Sandhill users still see their 12 programs

---

## Technical Details

### What security_invoker Does

```
security_invoker = false (DEFAULT):
  View runs as: postgres (view owner)
  RLS policies: BYPASSED
  Result: Users see ALL data

security_invoker = true (REQUIRED):
  View runs as: authenticated user making the query
  RLS policies: EVALUATED
  Result: Users see only THEIR company's data
```

### RLS Policy (Correctly Configured)

```sql
CREATE POLICY "Company admins view all company programs"
  ON pilot_programs
  FOR SELECT
  TO authenticated
  USING (
    is_company_admin()
    AND NOT is_super_admin()
    AND company_id = get_active_company_id()  -- ✓ Filters by active company
  );
```

This policy IS correct, but the view was bypassing it!

---

## Why Matt Saw the Wrong Data

1. **Matt logs in** → ProtectedRoute sets active company = GasX ✓
2. **Frontend queries** `pilot_programs_with_progress` view
3. **View executes as postgres** (not Matt) due to missing security_invoker
4. **RLS policies don't apply** to postgres user
5. **View returns ALL 12 programs** from database ❌
6. **Matt sees Sandhill programs** he shouldn't have access to ❌

### After the Fix

1. **Matt logs in** → ProtectedRoute sets active company = GasX ✓
2. **Frontend queries** `pilot_programs_with_progress` view
3. **View executes as Matt** due to security_invoker = true ✓
4. **RLS policies evaluate** in Matt's context ✓
5. **Policy checks:** company_id = get_active_company_id() → GasX ✓
6. **View returns 0 programs** (GasX has none) ✓
7. **Matt sees correct data** ✓

---

## Files Created

1. `supabase/migrations/20251109230000_fix_view_security_invoker_final.sql` - Migration to apply
2. `FIX_VIEW_SECURITY_NOW.sql` - Manual fix SQL
3. `apply-view-security-fix.mjs` - Automated application script
4. `VIEW_SECURITY_FIX_CRITICAL.md` - This documentation

---

## Status

- ✅ Issue identified
- ✅ Root cause confirmed
- ✅ Fix created
- ⏳ Awaiting application
- ⏳ Testing after application

---

## Next Steps

1. **Apply the migration** (use Option 1 or Option 2 above)
2. **Test with Matt** - Should see 0 programs
3. **Test with Sandhill user** - Should still see 12 programs
4. **Verify multi-tenancy** is working correctly
5. **Document the fix** in release notes

---

## Prevention

To prevent this in future:
- **ALWAYS** create views with `WITH (security_invoker = true)`
- **ALWAYS** test RLS with actual user accounts, not service role
- **ALWAYS** verify view options after creation:
  ```sql
  SELECT c.relname, c.reloptions
  FROM pg_class c
  WHERE c.relkind = 'v' AND c.relname LIKE '%program%';
  ```

---

**This is a CRITICAL security fix for multi-tenancy isolation!**

Without this fix, users can see data from other companies, violating the core security model of the application.
