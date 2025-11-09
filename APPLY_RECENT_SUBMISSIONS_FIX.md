# Fix for Missing get_recent_submissions_v3 Function

## Problem
The HomePage is trying to call `get_recent_submissions_v3` RPC function which doesn't exist in the database. This function was referencing the deleted `pilot_program_users` table.

## Solution
A new migration file has been created at:
```
supabase/migrations/20251109140000_create_get_recent_submissions_v3.sql
```

This migration creates:
1. **superadmin_impersonations table** - For tracking super admin company impersonation sessions
2. **get_impersonated_company_id()** - Helper function to extract impersonation context from JWT
3. **get_recent_submissions_v3()** - Main RPC function with proper role-based access control

## How to Apply the Migration

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the entire contents of `supabase/migrations/20251109140000_create_get_recent_submissions_v3.sql`
5. Click **Run** or press Cmd/Ctrl + Enter
6. You should see success messages in the Results panel

### Option 2: Using Supabase CLI (If you have it installed)

```bash
# From the project root directory
supabase db push
```

### Option 3: Manual SQL Execution

Copy the SQL from the migration file and execute it in sections:

#### Step 1: Create the impersonations table
```sql
-- Copy lines 47-86 from the migration file
```

#### Step 2: Create RLS policies
```sql
-- Copy lines 88-150 from the migration file
```

#### Step 3: Create helper function
```sql
-- Copy lines 152-177 from the migration file
```

#### Step 4: Create main RPC function
```sql
-- Copy lines 179-296 from the migration file
```

## Verification

After applying the migration, verify it worked by running this query in the SQL Editor:

```sql
-- Check if the function exists
SELECT
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE proname = 'get_recent_submissions_v3';
```

You should see one row returned with the function details.

## Testing the Function

Test the function with your user:

```sql
-- Get 10 most recent submissions (respects your company scoping)
SELECT * FROM get_recent_submissions_v3(10, NULL, NULL);

-- Get recent submissions for a specific program
SELECT * FROM get_recent_submissions_v3(
  10,
  'your-program-id-here'::uuid,
  NULL
);
```

## Access Control Summary

- **Super Admins (not impersonating)**: See submissions from ALL companies
- **Super Admins (impersonating)**: See only the impersonated company's submissions
- **Company Admins**: See all submissions from their company
- **All other roles**: See submissions from their company only
- **Inactive users**: Denied access (empty results)

## Rollback (if needed)

If you need to rollback this migration:

```sql
DROP FUNCTION IF EXISTS get_recent_submissions_v3(integer, uuid, uuid);
DROP FUNCTION IF EXISTS get_impersonated_company_id();
DROP TABLE IF EXISTS superadmin_impersonations CASCADE;
```

## Next Steps

Once the migration is applied:
1. Refresh your application in the browser
2. The error should be resolved
3. The HomePage should now display recent submissions correctly
4. Super admin impersonation functionality is now available for future implementation

## Notes

- The function respects all RLS policies and company scoping rules
- Deactivated users will see no submissions (empty result)
- The function is marked as SECURITY DEFINER for controlled RLS bypass
- All access is logged and auditable through the impersonations table
