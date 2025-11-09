# CRITICAL: Apply Sites RLS Fix Immediately

## Problem Summary

Admin and super admin users cannot see sites in the application because the current RLS policies require BOTH:
1. Company ID match
2. Explicit entry in `pilot_program_users` table

This is overly restrictive. Company admins and super admins should be able to see sites without needing explicit program access entries.

## Diagnosis Results

- **7 admin users** identified (all are both Super Admin AND Company Admin for Sandhill Growers)
- **12 programs** exist for Sandhill Growers
- **Many programs** lack explicit `pilot_program_users` entries for admins
- **Sites exist** in the database but are blocked by RLS policies
- **Current RLS policies** are too restrictive

## Solution

Apply the migration that simplifies the sites table RLS policies:
- Super admins: See ALL sites
- Company admins: See sites in programs owned by their company (via program's company_id)
- Regular users: See sites in programs they have explicit access to

## How to Apply the Fix

### Option 1: Via Supabase Dashboard (RECOMMENDED)

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the entire contents of:
   ```
   supabase/migrations/20251109120000_fix_sites_rls_admin_access.sql
   ```
5. Click **RUN** to execute the migration
6. Verify you see: "Sites RLS policies updated - admin access restored!"

### Option 2: Via Command Line (If you have Supabase CLI)

```bash
# Navigate to project directory
cd /tmp/cc-agent/51386994/project

# Apply the migration
supabase db push
```

## Quick SQL Fix (If you need immediate access)

If you need an emergency fix right now, run this simplified SQL in Supabase SQL Editor:

```sql
-- Drop restrictive policies
DROP POLICY IF EXISTS "Super admins can view all sites" ON sites;
DROP POLICY IF EXISTS "Company admins can view company sites" ON sites;
DROP POLICY IF EXISTS "Users can view sites in accessible programs" ON sites;

-- Super admins see everything
CREATE POLICY "Super admins can view all sites"
ON sites FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND users.is_super_admin = true
  )
);

-- Company admins see sites in their company's programs
CREATE POLICY "Company admins can view company sites"
ON sites FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    JOIN pilot_programs pp ON pp.company_id = u.company_id
    WHERE u.id = auth.uid()
      AND u.is_company_admin = true
      AND u.company_id IS NOT NULL
      AND sites.program_id = pp.program_id
  )
);

-- Regular users see sites in programs they have explicit access to
CREATE POLICY "Users can view sites in accessible programs"
ON sites FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM pilot_program_users ppu
    WHERE ppu.user_id = auth.uid()
      AND ppu.program_id = sites.program_id
  )
);
```

## What Changed

### Before (Broken)
```sql
-- Company admins required BOTH conditions:
-- 1. site.company_id = user.company_id (WRONG - too restrictive)
-- 2. user is company admin
```

### After (Fixed)
```sql
-- Company admins check via program ownership:
-- 1. user is company admin
-- 2. site's program belongs to user's company (via pilot_programs.company_id)
-- This allows admins to see all sites in their company's programs
```

## Verification

After applying the fix, you can verify it works by:

1. **Log in** as any admin user (e.g., `matt@grmtek.com`)
2. **Navigate to** any program (e.g., "Sandhill Period 3")
3. **Check** that sites are now visible in the Sites page
4. **Confirm** you can see sites even if you don't have an explicit `pilot_program_users` entry

Or run the diagnostic script:
```bash
node diagnose-admin-site-access.mjs
```

## Impact

- ✅ Super admins will see ALL sites across all companies
- ✅ Company admins will see ALL sites in their company's programs
- ✅ Regular users will only see sites in programs they have explicit access to
- ✅ Multi-tenancy data isolation remains intact
- ✅ No data loss or corruption

## Files Modified

- `supabase/migrations/20251109120000_fix_sites_rls_admin_access.sql` - New migration file
- RLS policies on `sites` table (SELECT, INSERT, UPDATE, DELETE)

## Next Steps

1. Apply the migration using one of the methods above
2. Refresh the application in your browser
3. Verify that sites are now visible to admin users
4. If issues persist, check browser console for errors

---

**URGENT**: This fix should be applied immediately as it's blocking admin users from accessing core functionality of the application.
