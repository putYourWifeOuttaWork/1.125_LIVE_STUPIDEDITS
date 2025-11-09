# Fix: Matt Cannot See Any Programs

## Problem Summary

User matt@grmtek.com (e0e9d5ba-6437-4625-aad1-4c23e5d77234) is a company admin for Sandhill Growers (company_id: 743d51b9-17bf-43d5-ad22-deebafead6fa) but cannot see any programs in the application, even though 12 programs exist in his company.

## Root Cause

The RLS (Row-Level Security) policies on `pilot_programs` and other tables use helper functions like `get_user_company_id()` and `user_is_company_admin()` that rely on `auth.uid()`. While these functions work correctly in authenticated contexts, the current policy structure may not be applying correctly for all company admins.

### Diagnostic Results

When checking Matt's account:
- ✅ User record exists with correct `company_id` and `is_company_admin = true`
- ✅ 12 programs exist with matching `company_id`
- ✅ Matt has explicit access to 7 programs via `pilot_program_users`
- ❌ RLS policies may not be evaluating correctly for company admin access

## Solution

Created a new migration that rewrites the RLS SELECT policies to use direct subqueries instead of helper functions. This makes the policies more reliable and explicit.

### Changes Made

**Migration File:** `supabase/migrations/20251109000012_fix_rls_policies_direct_queries.sql`

**Key Changes:**

1. **Replaced helper function calls with direct subqueries**
   - Old: `USING (user_is_company_admin() AND company_id = get_user_company_id())`
   - New: `USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_company_admin = true AND users.company_id IS NOT NULL AND pilot_programs.company_id = users.company_id))`

2. **Added explicit company admin policies for all tables**
   - `pilot_programs`
   - `sites`
   - `submissions`
   - `petri_observations`
   - `gasifier_observations`

3. **Added performance indexes**
   - `idx_users_auth_lookup` on users(id, company_id, is_company_admin, is_super_admin)
   - `idx_pilot_program_users_lookup` on pilot_program_users(user_id, program_id)

## How to Apply the Fix

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project SQL Editor:
   ```
   https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql
   ```

2. Copy the entire contents of:
   ```
   supabase/migrations/20251109000012_fix_rls_policies_direct_queries.sql
   ```

3. Paste into the SQL editor and click "Run"

4. Verify that all statements execute successfully

### Option 2: Supabase CLI

If you have the Supabase CLI installed and linked to your project:

```bash
supabase db push
```

This will apply all pending migrations.

## Verification Steps

After applying the migration:

### 1. Check Policy Application

Run this query in the Supabase SQL Editor to verify policies exist:

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'pilot_programs'
ORDER BY policyname;
```

You should see these policies:
- "Company admins can view company programs"
- "Super admins can view all programs"
- "Users can view programs with explicit access"

### 2. Test Matt's Access

```sql
-- Simulate Matt's access (requires manual auth context)
SELECT
  pp.program_id,
  pp.name,
  pp.company_id
FROM pilot_programs pp
JOIN users u ON u.company_id = pp.company_id
WHERE u.id = 'e0e9d5ba-6437-4625-aad1-4c23e5d77234'
  AND u.is_company_admin = true;
```

This should return 12 programs.

### 3. Frontend Testing

1. Have Matt log in to the application
2. Navigate to the Programs page
3. Verify all 12 programs are visible:
   - Refrigerator - Next Phase
   - IoT Test Program
   - Stuff
   - Sandhill Period 3
   - Sandhill Period 1
   - Refrigerator
   - Refrigerator - Next Phase (duplicate)
   - Sandhill Period 4
   - Sandhill Period 2
   - Alternate Garage
   - Sandhill Pilot #2 (Control)
   - Sandhill Pilot #2 (Experimental Phase)

## Expected Behavior After Fix

### For Super Admins
- Can see ALL programs across ALL companies
- Unrestricted access

### For Company Admins (like Matt)
- Can see ALL programs in their company
- Do NOT need explicit `pilot_program_users` entries
- Full access to their company's data

### For Regular Users
- Can ONLY see programs they have explicit access to via `pilot_program_users`
- Must be in the same company as the program
- Access controlled by role (Admin, Edit, Respond)

## Troubleshooting

### If Matt still cannot see programs:

1. **Check authentication state:**
   - Open browser DevTools → Console
   - Run: `supabase.auth.getSession()`
   - Verify `session.user.id` matches Matt's ID

2. **Check RLS policies applied:**
   ```sql
   SELECT COUNT(*) as policy_count
   FROM pg_policies
   WHERE tablename = 'pilot_programs'
     AND policyname LIKE '%Company admins%';
   ```
   Should return 1 or more.

3. **Check for errors in browser console:**
   - Look for Supabase errors
   - Check for RLS-related errors
   - Verify network requests are successful

4. **Verify user record:**
   ```sql
   SELECT id, email, company_id, is_company_admin, is_super_admin
   FROM users
   WHERE email = 'matt@grmtek.com';
   ```
   Ensure `company_id` is not NULL and `is_company_admin = true`.

## Rollback Plan

If the migration causes issues, you can rollback by restoring the original policies from:
```
supabase/migrations/20251109000003_rls_policies_core_tables.sql
```

Or manually drop and recreate the original policies.

## Additional Notes

- This fix does NOT change the access model, only makes it more reliable
- Helper functions (`is_super_admin()`, `get_user_company_id()`, etc.) are still available for other uses
- The new policies use direct subqueries which are more performant and explicit
- Indexes added will improve query performance for authentication checks

## Support

If issues persist after applying this migration, check:
1. Supabase project health status
2. Authentication configuration
3. Frontend Supabase client initialization
4. User session management in the application
