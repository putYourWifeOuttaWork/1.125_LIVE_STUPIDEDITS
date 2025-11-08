# URGENT: Apply Security Fix Migration Manually

## Problem Identified

Matt@grmtek.com cannot see any programs because:

1. ✅ Matt's user record is correct (company_id, is_company_admin = true)
2. ✅ Sandhill Growers company has 12 programs
3. ✅ RLS policies are defined correctly
4. ❌ **The security fix migration has NOT been applied yet**

The view `pilot_programs_with_progress` is still using the old definition (without SECURITY INVOKER), which means it's not respecting RLS policies properly.

## Solution: Apply Migration Manually

Since automated migration application isn't working, please apply this migration manually:

### Method 1: Supabase Dashboard (Recommended)

1. Go to your Supabase SQL Editor:
   ```
   https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql
   ```

2. Click "New Query"

3. Copy and paste the ENTIRE contents of this file:
   ```
   supabase/migrations/20251109000007_fix_view_security_invoker.sql
   ```

4. Click "Run" to execute

5. You should see success message

### The Migration SQL (Copy this if needed)

```sql
/*
  # Fix View Security to Respect RLS Policies

  This is a CRITICAL security fix for multi-tenancy data isolation.
*/

-- Drop the existing view
DROP VIEW IF EXISTS pilot_programs_with_progress;

-- Recreate the view with SECURITY INVOKER to respect RLS policies
CREATE OR REPLACE VIEW pilot_programs_with_progress
WITH (security_invoker = true)
AS
SELECT
  p.*,
  -- Calculate the total days in the program (inclusive of start and end date)
  (p.end_date - p.start_date + 1) AS days_count_this_program,

  -- Calculate the current day number within the program
  CASE
    -- Before the program starts: day 0
    WHEN CURRENT_DATE < p.start_date THEN 0
    -- During the program: current day number (1-based)
    WHEN CURRENT_DATE BETWEEN p.start_date AND p.end_date THEN
      (CURRENT_DATE - p.start_date + 1)
    -- After the program ends: max day number (capped at total days)
    ELSE (p.end_date - p.start_date + 1)
  END AS day_x_of_program,

  -- Calculate the progress percentage
  CASE
    -- Avoid division by zero if program duration is 0 days
    WHEN (p.end_date - p.start_date + 1) = 0 THEN 0
    -- Before the program starts: 0%
    WHEN CURRENT_DATE < p.start_date THEN 0
    -- During the program: calculate percentage
    WHEN CURRENT_DATE BETWEEN p.start_date AND p.end_date THEN
      ROUND(((CURRENT_DATE - p.start_date + 1)::NUMERIC / (p.end_date - p.start_date + 1)::NUMERIC) * 100, 2)
    -- After the program ends: 100%
    ELSE 100
  END AS phase_progress
FROM
  pilot_programs p;

-- Grant appropriate permissions
GRANT SELECT ON pilot_programs_with_progress TO authenticated;

-- Add comments for documentation
COMMENT ON VIEW pilot_programs_with_progress IS 'View that extends pilot_programs with dynamic progress metrics - SECURITY INVOKER enforces RLS';
COMMENT ON COLUMN pilot_programs_with_progress.days_count_this_program IS 'Total number of days in the program (end_date - start_date + 1)';
COMMENT ON COLUMN pilot_programs_with_progress.day_x_of_program IS 'Current day number within the program (0 before start, day number during, max after end)';
COMMENT ON COLUMN pilot_programs_with_progress.phase_progress IS 'Percentage progress through the program based on days elapsed (0-100%)';
```

### Method 2: Using psql (if you have database access)

If you have direct PostgreSQL access:

```bash
psql $DATABASE_URL < supabase/migrations/20251109000007_fix_view_security_invoker.sql
```

## After Applying the Migration

1. **Have Matt log out and log back in**
   - This ensures a fresh session with proper auth context

2. **Matt should now see:**
   - All 12 programs from Sandhill Growers company
   - No programs from other companies
   - Proper data isolation enforced

3. **Verify it worked:**
   ```sql
   -- Run this query as Matt to verify
   SELECT COUNT(*) FROM pilot_programs_with_progress;
   -- Should return 12 (Sandhill Growers programs only)
   ```

## What This Fix Does

- **Before**: View bypassed RLS, showing all programs to everyone (security vulnerability)
- **After**: View respects RLS, enforcing company-based access control (secure)

## Technical Details

The key change is adding `WITH (security_invoker = true)` to the view definition:

```sql
CREATE OR REPLACE VIEW pilot_programs_with_progress
WITH (security_invoker = true)  -- ← This is the critical fix
AS SELECT ...
```

This tells PostgreSQL to execute the view with the **calling user's permissions** instead of the view owner's permissions, which allows RLS policies on the underlying `pilot_programs` table to be properly enforced.

## Status

- ✅ Migration file created
- ✅ Issue diagnosed
- ❌ Migration not yet applied to database
- ⏳ Waiting for manual application

## Priority

🔴 **CRITICAL** - This is a security vulnerability affecting multi-tenancy data isolation.

---

**Once you've applied the migration, let me know and we'll verify Matt can see his programs!**
