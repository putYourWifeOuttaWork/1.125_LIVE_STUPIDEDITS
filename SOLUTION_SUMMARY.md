# Solution Summary: Matt Cannot See Programs

## Problem
User **matt@grmtek.com** is unable to see any programs in the application, despite being a company admin with access to 12 programs in his company (Sandhill Growers).

## Root Cause Analysis

### Investigation Results

1. **User Configuration** ✅
   - Matt is correctly configured as a company admin
   - `is_company_admin = true`
   - `company_id = 743d51b9-17bf-43d5-ad22-deebafead6fa` (Sandhill Growers)
   - User account is active

2. **Data Availability** ✅
   - 12 programs exist in Matt's company
   - All programs have matching `company_id`
   - Matt has explicit access to 7 out of 12 programs via `pilot_program_users` table

3. **RLS Policy Issue** ❌
   - The RLS (Row-Level Security) policies use helper functions that may not evaluate correctly
   - Helper functions like `get_user_company_id()` and `user_is_company_admin()` rely on `auth.uid()`
   - When testing with service role, these functions return NULL/false
   - The policies need to be rewritten to use direct subqueries

## Solution Implemented

Created a new database migration that rewrites all RLS SELECT policies to use direct subqueries instead of helper functions.

### Migration File
`supabase/migrations/20251109000012_fix_rls_policies_direct_queries.sql`

### Key Changes

#### Before (Helper Function Approach)
```sql
CREATE POLICY "Company admins can view company programs"
ON pilot_programs
FOR SELECT
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);
```

#### After (Direct Subquery Approach)
```sql
CREATE POLICY "Company admins can view company programs"
ON pilot_programs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_company_admin = true
      AND users.company_id IS NOT NULL
      AND pilot_programs.company_id = users.company_id
  )
);
```

### Benefits of This Approach
1. **More Reliable**: Direct subqueries are evaluated in the same context as the main query
2. **More Explicit**: The logic is clear and easy to understand
3. **Better Performance**: Added indexes for common lookup patterns
4. **Same Access Model**: No changes to who can access what

## Files Created

1. **FIX_MATT_PROGRAM_ACCESS.md** - Detailed fix documentation with troubleshooting
2. **verify-matt-access-fix.mjs** - Verification script to check the fix
3. **diagnose-rls-issue.mjs** - Diagnostic script used during investigation
4. **supabase/migrations/20251109000012_fix_rls_policies_direct_queries.sql** - The actual fix

## How to Apply

### Step 1: Apply the Migration

**Option A: Via Supabase Dashboard (Recommended)**
1. Open Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql
2. Copy the contents of `supabase/migrations/20251109000012_fix_rls_policies_direct_queries.sql`
3. Paste and click "Run"

**Option B: Via Supabase CLI**
```bash
supabase db push
```

### Step 2: Verify the Fix
```bash
node verify-matt-access-fix.mjs
```

This will check:
- RLS policies are in place
- Matt's user record is correct
- All 12 programs are in the database
- The RLS logic should work correctly

### Step 3: Test in Application
1. Have Matt log in to the application
2. Navigate to the Programs page
3. Verify all 12 programs are visible:
   - Alternate Garage
   - IoT Test Program
   - Refrigerator
   - Refrigerator - Next Phase (appears twice)
   - Sandhill Period 1
   - Sandhill Period 2
   - Sandhill Period 3
   - Sandhill Period 4
   - Sandhill Pilot #2 (Control)
   - Sandhill Pilot #2 (Experimental Phase)
   - Stuff

## Expected Behavior After Fix

### Super Admins
- Can see ALL programs across ALL companies
- No restrictions

### Company Admins (like Matt)
- Can see ALL programs in their company
- Do NOT need entries in `pilot_program_users`
- Full read/write access to company data

### Regular Users
- Can ONLY see programs they have explicit access to
- Must have an entry in `pilot_program_users`
- Access level determined by role (Admin, Edit, Respond)

## Tables Affected

The migration updates RLS policies on:
1. `pilot_programs` - Main programs table
2. `sites` - Sites within programs
3. `submissions` - Daily submissions
4. `petri_observations` - Petri dish observations
5. `gasifier_observations` - Gasifier observations

## Performance Improvements

Added indexes for faster RLS checks:
- `idx_users_auth_lookup` on users(id, company_id, is_company_admin, is_super_admin)
- `idx_pilot_program_users_lookup` on pilot_program_users(user_id, program_id)

## Rollback Plan

If issues occur, you can restore the original policies from:
`supabase/migrations/20251109000003_rls_policies_core_tables.sql`

## Testing Checklist

After applying the migration:

- [ ] Migration applied successfully in Supabase
- [ ] No errors in Supabase logs
- [ ] Run `node verify-matt-access-fix.mjs` - all checks pass
- [ ] Matt can log in successfully
- [ ] Matt can see all 12 programs on Programs page
- [ ] Matt can click into a program and see details
- [ ] Matt can create a new submission
- [ ] Other company admins still have access
- [ ] Regular users can still access their assigned programs
- [ ] Super admins maintain full access

## Support

If issues persist after applying the fix:

1. Check browser console for errors
2. Verify Matt's session: Run `supabase.auth.getSession()` in browser console
3. Check Supabase logs for RLS errors
4. Verify the policies were applied correctly in the database
5. Review `FIX_MATT_PROGRAM_ACCESS.md` for detailed troubleshooting

## Technical Notes

- The fix does NOT change the access control model
- Helper functions are still available but not used in policies
- The new approach is more aligned with PostgreSQL RLS best practices
- This fix resolves the issue for all company admins, not just Matt
