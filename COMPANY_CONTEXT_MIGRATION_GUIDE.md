# Company Context Migration Guide

**Date:** November 9, 2025
**Status:** ✅ Ready to Apply

---

## Overview

This migration implements a strict single-company-at-a-time access model for multi-tenancy. Users (including super admins) can only see and interact with data from ONE company at a time.

### Key Changes

1. **Active Company Context System**: Tracks which company each user is currently "logged into"
2. **Strict RLS Policies**: All data queries are automatically filtered by active company context
3. **Super Admin Company Switching**: Super admins can switch companies via dropdown, but see only one company's data at a time
4. **Company Data Integrity**: Database triggers ensure child records always match parent company_id
5. **No Cross-Company Access**: Absolute company boundaries with no exceptions

---

## Problem Solved

**Before:**
- Users at GasX company could see Sandhill programs if they had explicit pilot_program_users access
- RLS policies allowed cross-company access through pilot_program_users table
- Super admins had confusing "All Companies" view that didn't properly filter data
- Company boundaries were not strictly enforced

**After:**
- Users only see data from their active company (one company at a time)
- Super admins can switch companies, but see only that company's data
- Company admins see all company data without needing explicit program assignments
- Regular users see only their assigned programs within their company
- Zero cross-company data leakage

---

## Files Created/Modified

### Database Migrations

1. **`supabase/migrations/20251109170000_create_active_company_context.sql`**
   - Creates `user_active_company_context` table
   - Adds RPC functions:
     - `get_active_company_id()` - Returns active company for current user
     - `set_active_company_context(company_id)` - Sets active company
     - `get_active_company_context()` - Returns full context details
   - Backfills existing users with their assigned company

2. **`supabase/migrations/20251109170001_update_rls_policies_active_company.sql`**
   - Updates ALL RLS policies to use `get_active_company_id()` instead of `get_user_company_id()`
   - Separates policies for super admins, company admins, and regular users
   - Removes "All Companies" access pattern
   - Tables updated:
     - `pilot_programs`
     - `sites`
     - `submissions`
     - `petri_observations`
     - `gasifier_observations`

3. **`supabase/migrations/20251109170002_add_company_data_integrity.sql`**
   - Adds validation triggers to ensure company_id consistency
   - Auto-sets company_id from parent records
   - Backfills any mismatched company_ids
   - Prevents orphaned cross-company records

### Frontend Changes

4. **`src/stores/companyFilterStore.ts`**
   - Added `setActiveCompanyContext()` - Calls database RPC to switch companies
   - Added `loadActiveCompanyContext()` - Loads active company from database
   - Added loading and error state management
   - Syncs local state with database

5. **`src/components/layouts/AppLayout.tsx`**
   - Updated company dropdown to use new context system
   - Added `handleCompanyChange()` - Switches company and reloads app
   - Removed "All Companies" option
   - Shows checkmark for active company
   - Loads active company context on mount

6. **`src/hooks/usePilotPrograms.ts`**
   - Removed manual company filtering
   - Added comments explaining RLS-based filtering
   - Relies entirely on database policies for company isolation

### Test & Documentation

7. **`test-company-isolation.mjs`**
   - Automated test script to verify company isolation
   - Tests program, site, and submission visibility
   - Tests super admin company switching
   - Verifies no cross-company data leakage

8. **`COMPANY_CONTEXT_MIGRATION_GUIDE.md`** (this file)
   - Complete migration instructions
   - Troubleshooting guide
   - Rollback procedures

---

## Migration Steps

### Prerequisites

1. **Backup your database** before applying migrations
2. Ensure you have Supabase admin access
3. Test in a staging environment first if possible

### Step 1: Apply Database Migrations

Choose one of these methods:

#### Method A: Using Supabase CLI (Recommended)

```bash
cd /path/to/project
npx supabase db push
```

#### Method B: Using Supabase Dashboard

1. Log in to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and paste each migration file in order:
   - `20251109170000_create_active_company_context.sql`
   - `20251109170001_update_rls_policies_active_company.sql`
   - `20251109170002_add_company_data_integrity.sql`
4. Run each migration one at a time
5. Verify no errors occurred

### Step 2: Deploy Frontend Changes

```bash
# Build the project
npm run build

# Deploy to your hosting platform
# (Follow your normal deployment process)
```

### Step 3: Verify the Migration

#### Test 1: Check Active Company Context

```sql
-- Run in Supabase SQL Editor while logged in as a test user
SELECT * FROM get_active_company_context();
```

**Expected result:**
```json
{
  "success": true,
  "user_id": "<your-user-id>",
  "is_super_admin": true/false,
  "is_company_admin": true/false,
  "assigned_company_id": "<company-id>",
  "active_company_id": "<company-id>",
  "active_company_name": "Company Name",
  "can_switch_companies": true/false
}
```

#### Test 2: Run Automated Test Script

```bash
# Make sure you're logged into the app first
node test-company-isolation.mjs
```

**Expected output:**
```
✓ Active Company Context: PASSED
✓ Program Visibility: PASSED
✓ Site Visibility: PASSED
✓ Submission Visibility: PASSED
✓ Company Switching: PASSED

All 5 tests passed! ✓
Company isolation is working correctly.
```

#### Test 3: Manual UI Testing

1. **For Regular Users:**
   - Log in to the application
   - Verify you only see programs from your assigned company
   - Verify you cannot see programs from other companies

2. **For Company Admins:**
   - Log in to the application
   - Verify you see ALL programs in your company
   - Verify you don't need explicit program assignments
   - Verify you cannot see programs from other companies

3. **For Super Admins:**
   - Log in to the application
   - Check the company dropdown in the header
   - Select a company from the dropdown
   - Verify ONLY programs from that company are visible
   - Switch to a different company
   - Verify programs changed to the new company's programs
   - Verify no cross-company data is visible

---

## How It Works

### Active Company Context

Every user has an "active company" stored in the `user_active_company_context` table:

- **Regular Users & Company Admins:** Active company is locked to their assigned company
- **Super Admins:** Active company can be switched via dropdown

### RLS Policy Flow

```
User makes query
  ↓
Database calls get_active_company_id()
  ↓
  ├─ Super Admin? → Returns company from user_active_company_context
  ├─ Company Admin? → Returns assigned company_id
  └─ Regular User? → Returns assigned company_id
  ↓
RLS policy filters: WHERE company_id = get_active_company_id()
  ↓
User sees only data from active company
```

### Company Switching (Super Admin Only)

```
Super admin clicks company dropdown
  ↓
Selects "Sandhill Growers"
  ↓
Frontend calls set_active_company_context(sandhill_id)
  ↓
Database updates user_active_company_context table
  ↓
Frontend reloads (window.location.reload())
  ↓
All queries now use Sandhill Growers company_id
  ↓
Super admin sees only Sandhill data
```

---

## Access Control Matrix

| User Type | Company Match | Program Access Required | Can See |
|-----------|---------------|------------------------|---------|
| Super Admin | Yes (active) | No | All data in active company |
| Company Admin | Yes | No | All data in assigned company |
| Regular User | Yes | Yes | Only assigned programs in company |
| Any User | No | N/A | Nothing (strict isolation) |

---

## Troubleshooting

### Issue: "No programs visible after migration"

**Possible causes:**
1. Active company context not initialized
2. User has no company assigned
3. Company has no programs

**Solutions:**
```sql
-- Check user's company assignment
SELECT id, email, company_id, is_company_admin, is_super_admin
FROM users
WHERE email = 'user@example.com';

-- Check active company context
SELECT * FROM user_active_company_context WHERE user_id = '<user-id>';

-- Initialize context if missing
INSERT INTO user_active_company_context (user_id, active_company_id)
VALUES ('<user-id>', '<company-id>')
ON CONFLICT (user_id) DO UPDATE SET active_company_id = '<company-id>';

-- Verify programs exist for company
SELECT COUNT(*) FROM pilot_programs WHERE company_id = '<company-id>';
```

### Issue: "Super admin can't switch companies"

**Possible causes:**
1. Not actually a super admin
2. Target company doesn't exist
3. RPC function permission issue

**Solutions:**
```sql
-- Verify super admin status
SELECT is_super_admin FROM users WHERE id = auth.uid();

-- List all companies
SELECT company_id, name FROM companies;

-- Test company switching
SELECT set_active_company_context('<target-company-id>');

-- Grant permission if needed
GRANT EXECUTE ON FUNCTION set_active_company_context(UUID) TO authenticated;
```

### Issue: "Seeing programs from multiple companies"

**This is a critical security issue!**

**Diagnosis:**
```sql
-- Check which companies' programs are visible
SELECT DISTINCT p.company_id, c.name
FROM pilot_programs_with_progress p
LEFT JOIN companies c ON c.company_id = p.company_id;

-- Check your active company
SELECT * FROM get_active_company_context();

-- Check RLS policies
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'pilot_programs';
```

**Solutions:**
1. Verify migrations applied in correct order
2. Check that RLS is enabled: `ALTER TABLE pilot_programs ENABLE ROW LEVEL SECURITY;`
3. Verify view security: Check that `pilot_programs_with_progress` has `security_invoker = true`
4. Force reload: Clear browser cache and reload app

### Issue: "Company admin can't see all company programs"

**Possible causes:**
1. `is_company_admin` flag not set
2. Active company doesn't match assigned company
3. RLS policy issue

**Solutions:**
```sql
-- Check company admin status
SELECT is_company_admin, company_id FROM users WHERE id = auth.uid();

-- Set company admin flag
UPDATE users SET is_company_admin = true WHERE email = 'admin@company.com';

-- Verify active company matches
SELECT
  u.company_id as assigned_company,
  uacc.active_company_id as active_company
FROM users u
LEFT JOIN user_active_company_context uacc ON uacc.user_id = u.id
WHERE u.id = auth.uid();

-- Re-initialize active company context
DELETE FROM user_active_company_context WHERE user_id = '<user-id>';
-- Context will auto-initialize on next login
```

---

## Rollback Instructions

If you need to rollback these changes:

### Step 1: Rollback Frontend

```bash
git revert <commit-hash>
npm run build
# Deploy previous version
```

### Step 2: Rollback Database

```sql
-- Drop new table
DROP TABLE IF EXISTS user_active_company_context CASCADE;

-- Drop new functions
DROP FUNCTION IF EXISTS get_active_company_id() CASCADE;
DROP FUNCTION IF EXISTS set_active_company_context(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_active_company_context() CASCADE;

-- Drop new triggers and functions
DROP TRIGGER IF EXISTS trigger_validate_site_company_id ON sites;
DROP TRIGGER IF EXISTS trigger_validate_submission_company_id ON submissions;
DROP TRIGGER IF EXISTS trigger_validate_petri_observation_company_id ON petri_observations;
DROP TRIGGER IF EXISTS trigger_validate_gasifier_observation_company_id ON gasifier_observations;

DROP FUNCTION IF EXISTS validate_site_company_id() CASCADE;
DROP FUNCTION IF EXISTS validate_submission_company_id() CASCADE;
DROP FUNCTION IF EXISTS validate_petri_observation_company_id() CASCADE;
DROP FUNCTION IF EXISTS validate_gasifier_observation_company_id() CASCADE;

-- Restore original RLS policies
-- (You'll need to re-apply the previous migration that created the original policies)
```

**Warning:** Rolling back will restore the bug where users can see cross-company data. Only rollback if absolutely necessary.

---

## Performance Considerations

### Database Performance

- **New indexes created:** 2 on `user_active_company_context` (minimal overhead)
- **Function calls:** `get_active_company_id()` is called for every RLS check (marked STABLE for caching)
- **Expected impact:** Negligible - likely under 1ms per query

### Frontend Performance

- **Company switching:** Requires full page reload (intentional for simplicity)
- **Query caching:** React Query cache is preserved within a company context
- **Network requests:** No additional requests per query (RLS is database-side)

### Optimization Tips

If you experience performance issues:

1. **Add index on company_id columns** (if not already indexed):
```sql
CREATE INDEX IF NOT EXISTS idx_pilot_programs_company_id ON pilot_programs(company_id);
CREATE INDEX IF NOT EXISTS idx_sites_company_id ON sites(company_id);
CREATE INDEX IF NOT EXISTS idx_submissions_company_id ON submissions(company_id);
```

2. **Monitor slow queries**:
```sql
-- Enable query logging in Supabase Dashboard
-- Settings → Database → Query Performance
```

---

## Security Benefits

1. **Absolute Company Isolation:** Zero chance of cross-company data leakage
2. **Defense in Depth:** Multiple layers enforce boundaries (RLS + triggers + app logic)
3. **Audit Trail:** Company context changes are tracked with timestamps
4. **Fail-Safe Design:** If active company is not set, user sees nothing (not everything)
5. **Simple Mental Model:** "One company at a time" is easy to understand and verify

---

## Success Criteria

The migration is successful when:

- ✅ Regular users see only their assigned company's data
- ✅ Company admins see all data in their company without explicit assignments
- ✅ Super admins can switch companies and see only that company's data
- ✅ No cross-company data is visible under any circumstances
- ✅ Test script passes all 5 tests
- ✅ UI displays correct company name in header
- ✅ Company switching works smoothly for super admins
- ✅ Build completes without errors

---

## Support

If you encounter issues:

1. Check the **Troubleshooting** section above
2. Run the test script: `node test-company-isolation.mjs`
3. Check migration logs for errors
4. Verify RLS policies are in place
5. Review browser console for frontend errors

---

## Next Steps After Migration

1. **Test thoroughly** with different user types
2. **Monitor** for any unexpected behavior
3. **Document** any company-specific configurations
4. **Train users** on the new company switching feature (super admins)
5. **Celebrate** secure, properly isolated multi-tenancy!

---

**Migration Complete!** 🎉

Your application now has strict company-based multi-tenancy with zero cross-company data visibility.
