# Multi-Tenancy Fix - Application Guide

## Overview

This guide will help you apply the multi-tenancy fixes that resolve the issue where company admins (like you at Sandhill Growers) cannot see any programs or records.

## Problem Summary

The current RLS (Row-Level Security) policies require users to have BOTH:
1. A matching company_id
2. An entry in the pilot_program_users table

This means company admins need explicit program assignments, which defeats the purpose of company-level admin access.

## Solution Summary

The fix updates RLS policies so that:
- **Super admins** see everything across all companies
- **Company admins** see all data in their company (no explicit program access needed)
- **Regular users** see only explicitly assigned programs within their company

## Migration Files Created

Four new migration files have been created:

1. **20251109000008_diagnostic_rpc_functions.sql**
   - Creates diagnostic functions to troubleshoot access issues
   - Functions: `get_user_access_debug()`, `check_program_visibility()`, `list_visible_programs()`

2. **20251109000009_fix_rls_company_admin_access.sql**
   - Fixes RLS policies on all core tables
   - Separates access logic for super admins, company admins, and regular users
   - Tables: pilot_programs, sites, submissions, petri_observations, gasifier_observations

3. **20251109000010_fix_view_security_context.sql**
   - Recreates pilot_programs_with_progress view with SECURITY INVOKER
   - Ensures the view respects RLS policies

4. **20251109000011_verify_user_company_assignments.sql**
   - Verifies Sandhill Growers company exists
   - Verifies your user (matt@grmtek.com) has correct company assignment
   - Creates helper functions: `assign_user_to_company()`, `toggle_user_company_admin()`

## How to Apply

### Option 1: Using Supabase CLI (Recommended)

```bash
# Make sure you're in the project directory
cd /path/to/project

# Apply all pending migrations
npx supabase db push

# Or apply migrations individually
npx supabase db push --file supabase/migrations/20251109000008_diagnostic_rpc_functions.sql
npx supabase db push --file supabase/migrations/20251109000009_fix_rls_company_admin_access.sql
npx supabase db push --file supabase/migrations/20251109000010_fix_view_security_context.sql
npx supabase db push --file supabase/migrations/20251109000011_verify_user_company_assignments.sql
```

### Option 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of each migration file
4. Execute them in order (8, 9, 10, 11)
5. Review the output for any errors or notices

### Option 3: Manual SQL Execution

If you have direct database access:

```bash
# Execute each migration file
psql $DATABASE_URL -f supabase/migrations/20251109000008_diagnostic_rpc_functions.sql
psql $DATABASE_URL -f supabase/migrations/20251109000009_fix_rls_company_admin_access.sql
psql $DATABASE_URL -f supabase/migrations/20251109000010_fix_view_security_context.sql
psql $DATABASE_URL -f supabase/migrations/20251109000011_verify_user_company_assignments.sql
```

## Testing the Fix

After applying the migrations, run the test script:

```bash
# Make the test script executable
chmod +x test-multi-tenancy-fix.mjs

# Run the test (you must be logged in to the app first)
node test-multi-tenancy-fix.mjs
```

The test will verify:
- ✅ Your user has correct company assignment
- ✅ Diagnostic functions are available
- ✅ You can see programs in Sandhill Growers
- ✅ RLS policies are working correctly

## Expected Results

After applying the fix and logging into the application, you should:

1. **See all Sandhill Growers programs** on your profile page
2. **See all sites** within those programs
3. **See all submissions** and observations for your company
4. **Not need entries in pilot_program_users** table to access company data

## Verification Steps

### 1. Check User Access Debug Info

You can call this diagnostic function from the app or SQL editor:

```sql
SELECT * FROM get_user_access_debug();
```

Expected output for you:
```json
{
  "user_id": "your-uuid",
  "company_id": "sandhill-growers-uuid",
  "company_name": "Sandhill Growers",
  "is_super_admin": false,
  "is_company_admin": true,
  "programs_in_company": <number>,
  "explicit_program_access_count": <number>,
  "access_summary": "Company Admin - Should see all data in Sandhill Growers"
}
```

### 2. List Visible Programs

```sql
SELECT * FROM list_visible_programs();
```

This should return all programs in Sandhill Growers with "Company Admin Access" as the reason.

### 3. Check Program Visibility

To diagnose a specific program:

```sql
SELECT * FROM check_program_visibility('<program-id>');
```

### 4. Test in the UI

1. Log in to the application as matt@grmtek.com
2. Navigate to your Profile page
3. You should see all Sandhill Growers programs listed
4. Navigate to any program's sites page
5. You should see all sites and data

## Troubleshooting

### Issue: Still can't see programs

**Possible causes:**
1. Migrations not applied - Apply all 4 migrations in order
2. User not assigned to company - Check `users` table for your `company_id`
3. Not marked as company admin - Check `users.is_company_admin` flag
4. Browser cache - Clear cache and hard refresh (Cmd+Shift+R or Ctrl+Shift+R)

**Solution:**
```sql
-- Check your user record
SELECT id, email, company_id, is_company_admin, is_super_admin
FROM users
WHERE email = 'matt@grmtek.com';

-- If company_id is null or wrong, fix it manually:
UPDATE users
SET company_id = (SELECT company_id FROM companies WHERE name = 'Sandhill Growers'),
    is_company_admin = true
WHERE email = 'matt@grmtek.com';
```

### Issue: Programs exist but aren't associated with Sandhill Growers

**Solution:**
```sql
-- Check which company programs belong to
SELECT program_id, name, company_id,
       (SELECT name FROM companies WHERE company_id = pilot_programs.company_id) as company_name
FROM pilot_programs;

-- If programs have null or wrong company_id, update them:
UPDATE pilot_programs
SET company_id = (SELECT company_id FROM companies WHERE name = 'Sandhill Growers')
WHERE company_id IS NULL OR company_id != (SELECT company_id FROM companies WHERE name = 'Sandhill Growers');
```

### Issue: Sandhill Growers company doesn't exist

The migration should create it automatically, but if needed:

```sql
-- Create Sandhill Growers company
INSERT INTO companies (name, description, website)
VALUES (
  'Sandhill Growers',
  'Sandhill is proud to be one of the largest "all native" nurseries in Florida, specializing in native plants, grasses, shrubs, and trees. We also have developed an Environmental Services Division providing a wide range of Ecosystem Restoration and Management.',
  'https://sandhillgrowers.com/'
);
```

## What Changed

### RLS Policy Logic (Before vs After)

**BEFORE (Wrong):**
```sql
-- Regular users AND company admins both needed explicit access
CREATE POLICY "Users can view programs"
ON pilot_programs FOR SELECT
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)  -- ❌ This blocks admins!
);
```

**AFTER (Correct):**
```sql
-- Company admins see all company programs (no explicit access needed)
CREATE POLICY "Company admins can view company programs"
ON pilot_programs FOR SELECT
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()  -- ✅ Only needs company match
);

-- Regular users need explicit access
CREATE POLICY "Users can view programs with explicit access"
ON pilot_programs FOR SELECT
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
  AND NOT user_is_company_admin()  -- ✅ Doesn't apply to admins
);
```

## Rollback (If Needed)

If you need to rollback these changes:

```sql
-- This will restore the previous RLS policies
-- Note: This will bring back the original bug

-- Drop new diagnostic functions
DROP FUNCTION IF EXISTS get_user_access_debug();
DROP FUNCTION IF EXISTS check_program_visibility(UUID);
DROP FUNCTION IF EXISTS list_visible_programs();
DROP FUNCTION IF EXISTS assign_user_to_company(TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS toggle_user_company_admin(TEXT, BOOLEAN);

-- Restore original policies (see migration 20251109000003_rls_policies_core_tables.sql)
```

## Support

If you encounter issues after applying these fixes:

1. Run the diagnostic test script: `node test-multi-tenancy-fix.mjs`
2. Check the diagnostic function output: `SELECT * FROM get_user_access_debug()`
3. Review the migration logs for any errors
4. Verify all 4 migrations were applied successfully

## Summary

These migrations fix the multi-tenancy access control so company admins can properly see all data within their company. The key change is separating the RLS policies for admins vs regular users, and ensuring the view respects these policies.

After applying these migrations, you should immediately be able to see all Sandhill Growers programs and data when logged in as a company admin.
