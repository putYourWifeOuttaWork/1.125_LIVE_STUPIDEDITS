# Apply User Management and Device Pool Migration

## Migration File
`supabase/migrations/20251109160000_user_management_and_device_pool.sql`

**✅ UPDATED:** Migration now includes `DROP FUNCTION IF EXISTS` statements to handle conflicts with existing functions.

## What This Migration Does

This migration creates the necessary database functions and policies to support:

1. **User Search and Assignment**
   - `search_users_by_email`: Search for existing users by email
   - `add_user_to_company`: Assign existing user to a company
   - `remove_user_from_company`: Remove user from company

2. **Device Pool Management**
   - `get_unassigned_devices`: View devices without company assignment
   - `assign_device_to_company`: Assign device to a company
   - `get_device_pool_stats`: Get statistics on unassigned devices

3. **RLS Policy Updates**
   - Super admins can see ALL devices (including unassigned)
   - Regular users only see devices assigned to their company
   - Proper permission checks on all operations

## How to Apply

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new
2. Copy the entire contents of `supabase/migrations/20251109160000_user_management_and_device_pool.sql`
3. Paste into the SQL Editor
4. Click "Run" to execute
5. Verify success (should see "Success. No rows returned")

### Option 2: Via Supabase CLI

```bash
cd /tmp/cc-agent/51386994/project
supabase db push
```

### Option 3: Via psql

```bash
psql "postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres" \
  -f supabase/migrations/20251109160000_user_management_and_device_pool.sql
```

## Verification

After applying, verify the functions were created:

```sql
-- Check if functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'search_users_by_email',
    'add_user_to_company',
    'remove_user_from_company',
    'get_unassigned_devices',
    'assign_device_to_company',
    'get_device_pool_stats'
  );
```

Should return 6 rows.

## Testing the Functions

```sql
-- Test search users (as authenticated user)
SELECT * FROM search_users_by_email('test@example.com');

-- Test device pool (as super admin)
SELECT * FROM get_unassigned_devices();

-- Test device pool stats (as super admin)
SELECT * FROM get_device_pool_stats();
```

## Security Notes

- All functions use `SECURITY DEFINER` for proper permission checks
- User management functions check for company admin or super admin role
- Device pool functions are super admin only
- All operations are logged in audit_log table
- Functions validate inputs and prevent invalid operations

## Next Steps

Once migration is applied:
1. Update CompanyUsersModal to use these functions
2. Create Device Pool page for super admins
3. Test user assignment workflow
4. Test device assignment workflow
