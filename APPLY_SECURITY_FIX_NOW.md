# CRITICAL: Apply Multi-Tenancy Security Fix

## What's Wrong Right Now

You're seeing ALL programs from ALL companies because the database view is bypassing security policies. This is a **critical security vulnerability**.

## Quick Fix (2 Steps)

### Step 1: Apply the Migration

Apply migration `20251109000007_fix_view_security_invoker.sql` to your database.

This will recreate the `pilot_programs_with_progress` view with proper security settings.

### Step 2: Assign Your User to a Company

You're currently logged in as a user with **no company assignment**. After applying the fix, you'll see zero programs (which is correct for security).

To see programs, you need to be assigned to a company:

```sql
-- Option A: Assign to existing "Sandhill Growers" company
UPDATE users
SET company_id = (
  SELECT company_id
  FROM companies
  WHERE name = 'Sandhill Growers'
  LIMIT 1
)
WHERE email = 'your-email@example.com';
```

Then grant program access:

```sql
-- Grant access to specific programs
INSERT INTO pilot_program_users (user_id, program_id, role)
VALUES (
  (SELECT id FROM users WHERE email = 'your-email@example.com'),
  (SELECT program_id FROM pilot_programs WHERE name = 'Sandhill Period 2'),
  'Viewer'
);
```

## Alternative: Make Yourself a Super Admin

If you need to see everything for testing:

```sql
UPDATE users
SET is_super_admin = true
WHERE email = 'your-email@example.com';
```

⚠️ **Warning**: Super admins see ALL data across ALL companies. Use sparingly.

## What Happens After the Fix

✅ **Security Restored**: Companies can no longer see each other's data
✅ **Proper Isolation**: Users must be assigned to companies and programs
✅ **Expected Behavior**:
- Users without company_id → See 0 programs
- Users with company_id but no program access → See 0 programs
- Users with company_id + program access → See only their programs
- Super admins → See everything

## Files Created

1. **Migration**: `/supabase/migrations/20251109000007_fix_view_security_invoker.sql`
2. **Documentation**: `/MULTI_TENANCY_FIX_APPLIED.md` (detailed explanation)

## Next Steps After Applying Fix

1. ✅ Apply migration 20251109000007
2. ⏳ Assign your user to a company (or make super admin)
3. ⏳ Refresh the application
4. ✅ Verify you now see only programs you should have access to

---

**Status**: Ready to apply
**Priority**: 🔴 CRITICAL - Security vulnerability
**Impact**: Will fix data isolation between companies
