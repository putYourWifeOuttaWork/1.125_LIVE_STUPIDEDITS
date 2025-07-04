# Supabase Rollback Instructions

Since the Supabase CLI (`supabase` command) isn't available in this environment, you'll need to manually apply the rollback script using the Supabase SQL Editor.

## Option 1: Apply Rollback via Supabase Dashboard

1. Log in to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to the SQL Editor
4. Create a new query
5. Copy the entire contents of the `supabase/migrations/20250601000000_rollback_companies.sql` file
6. Paste into the SQL Editor
7. Run the query

## Option 2: Using Supabase CLI Locally

If you have the Supabase CLI installed on your local machine (outside this environment):

```bash
# Navigate to your project directory
cd /path/to/your/project

# Run the migration down command to rollback
supabase migration down 20250531142627

# OR if you want to reset to a specific migration
supabase db reset --db-version 20250531141702
```

## Verifying the Rollback

After applying the rollback:

1. Check that the `companies` table no longer exists
2. Verify the `pilot_programs` table no longer has a `company_id` column
3. Confirm that the `users` table no longer has `company_id` and `is_company_admin` columns
4. Test that RLS policies are working correctly with the restored simpler logic

## Important Notes

- This rollback will permanently delete all company data
- Any associations between users, programs, and companies will be lost
- Make sure to have a backup before proceeding