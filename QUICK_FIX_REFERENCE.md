# Multi-Tenancy Fix - Quick Reference Card

**Problem:** Company admin cannot see programs or records
**Status:** ✅ Fixed and ready to apply
**Time to Fix:** ~5 minutes

---

## Apply the Fix (Choose ONE method)

### Method 1: Supabase CLI (Fastest)
```bash
npx supabase db push
```

### Method 2: Supabase Dashboard
1. Go to SQL Editor
2. Copy/paste these files in order:
   - `supabase/migrations/20251109000008_diagnostic_rpc_functions.sql`
   - `supabase/migrations/20251109000009_fix_rls_company_admin_access.sql`
   - `supabase/migrations/20251109000010_fix_view_security_context.sql`
   - `supabase/migrations/20251109000011_verify_user_company_assignments.sql`
3. Execute each one

---

## Verify the Fix

### Option A: Run Test Script
```bash
node test-multi-tenancy-fix.mjs
```

### Option B: SQL Check
```sql
SELECT * FROM get_user_access_debug();
-- Should show: is_company_admin = true
```

### Option C: UI Check
1. Log in to the app
2. Go to Profile page
3. Programs should now be visible ✓

---

## What This Fixes

**Before:**
- Company admins needed entries in `pilot_program_users` table ❌
- Couldn't see any programs despite being admin ❌

**After:**
- Company admins see all company data automatically ✅
- No explicit program assignments needed ✅

---

## Troubleshooting

### Still can't see programs?

**Check 1:** User company assignment
```sql
SELECT email, company_id, is_company_admin
FROM users WHERE email = 'matt@grmtek.com';
```

**Check 2:** Programs have company
```sql
SELECT name, company_id FROM pilot_programs;
```

**Fix manually if needed:**
```sql
-- Assign user to Sandhill Growers as admin
UPDATE users
SET company_id = (SELECT company_id FROM companies WHERE name = 'Sandhill Growers'),
    is_company_admin = true
WHERE email = 'matt@grmtek.com';
```

---

## Files Created

| File | Purpose |
|------|---------|
| **4 Migration Files** | Database fixes (apply these) |
| **test-multi-tenancy-fix.mjs** | Test script |
| **APPLY_MULTI_TENANCY_FIX.md** | Full guide |
| **MULTI_TENANCY_FIX_SUMMARY.md** | Detailed summary |
| **QUICK_FIX_REFERENCE.md** | This card |

---

## Need More Help?

📖 Read: `APPLY_MULTI_TENANCY_FIX.md`
🔍 Debug: `SELECT * FROM get_user_access_debug()`
✅ Test: `node test-multi-tenancy-fix.mjs`

---

**That's it! Apply migrations, refresh page, see your data. 🎉**
