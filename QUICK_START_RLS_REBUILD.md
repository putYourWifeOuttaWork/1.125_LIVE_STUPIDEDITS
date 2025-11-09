# Quick Start: RLS Rebuild

## 🚀 Immediate Action Required

This project has a complete RLS rebuild ready to deploy. Here's what you need to do:

## Step 1: Apply Migrations (Manual)

Go to your Supabase SQL Editor:
https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new

Apply these files IN ORDER (copy/paste contents and click "Run"):

1. ✅ `supabase/migrations/20251109130000_complete_rls_rebuild.sql`
2. ✅ `supabase/migrations/20251109130001_rls_policies_all_tables.sql`
3. ✅ `supabase/migrations/20251109130002_rls_policies_history_and_supporting.sql`
4. ✅ `supabase/migrations/20251109130003_remove_pilot_program_users.sql`

**⚠️ WAIT for each migration to complete before running the next one!**

## Step 2: Verify Success

Run in SQL Editor:

```sql
SELECT * FROM validate_rls_setup();
```

You should see all tables with `rls_enabled = true` and policy counts > 0.

## Step 3: Assign User Roles

All users are now set to `observer` role by default. Update as needed:

```sql
-- Make someone a company admin
UPDATE users SET is_company_admin = true, user_role = 'sysAdmin' WHERE email = 'admin@company.com';

-- Assign analyst roles
UPDATE users SET user_role = 'analyst', export_rights = 'history_and_analytics' WHERE email = 'analyst@company.com';

-- Assign maintenance roles
UPDATE users SET user_role = 'maintenance' WHERE email = 'maintenance@company.com';

-- Check results
SELECT email, user_role, is_company_admin, export_rights, is_active FROM users ORDER BY user_role;
```

## Step 4: Test Access

Log in with different user accounts and verify:

1. ✅ Can only see own company data
2. ✅ Deactivated users are blocked
3. ✅ Role permissions work as expected
4. ✅ Programs visible without pilot_program_users entries

## What Changed?

### ❌ Removed
- `pilot_program_users` table (archived to `pilot_program_users_archive`)

### ✅ Added
- `user_role` enum: observer, analyst, maintenance, sysAdmin
- `export_rights` enum: none, history, history_and_analytics, all
- Company name auto-sync trigger
- Comprehensive RLS policies for all tables

### Access Model
- **All active users** in a company can view all programs/sites in that company
- **Observers**: Can read and write observations
- **Analysts**: Can read everything + view history
- **Maintenance**: Can manage devices + delete observations
- **SysAdmin**: Full CRUD within company
- **Company Admin**: Full company management
- **Super Admin**: Full access across all companies

## Role Permissions Quick Reference

| Can Do | Observer | Analyst | Maintenance | SysAdmin | Co Admin | Super |
|--------|----------|---------|-------------|----------|----------|-------|
| View company data | ✓ | ✓ | ✓ | ✓ | ✓ | All |
| Write observations | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View history | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ |
| Create reports | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ |
| Delete observations | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Manage devices | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Delete device images | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Manage programs | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Manage users | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |

## If Something Goes Wrong

### Rollback
```bash
# In Supabase SQL Editor, run:
supabase/RLS_REBUILD_ROLLBACK.sql
```

This will:
- Restore pilot_program_users table
- Remove new RLS policies
- Restore basic old policies

## Documentation

- **Full Details**: `RLS_REBUILD_DOCUMENTATION.md`
- **Implementation Summary**: `RLS_REBUILD_IMPLEMENTATION_SUMMARY.md`
- **Rollback Script**: `supabase/RLS_REBUILD_ROLLBACK.sql`

## Common Issues

### "User cannot see any data"
```sql
-- Check user status
SELECT email, is_active, company_id, user_role FROM users WHERE email = 'user@example.com';

-- Fix: Activate user
UPDATE users SET is_active = true WHERE email = 'user@example.com';
```

### "Company admin cannot see all data"
```sql
-- Grant company admin
UPDATE users SET is_company_admin = true WHERE email = 'admin@example.com';
```

### "User sees other company's data"
```sql
-- Check super admin flag
SELECT email, is_super_admin, company_id FROM users WHERE email = 'user@example.com';

-- Remove if incorrectly set
UPDATE users SET is_super_admin = false WHERE email = 'user@example.com';
```

## Frontend Updates Needed

Search and remove references to:
- `pilot_program_users` queries
- `user_has_program_access` checks

Add UI for:
- Setting `user_role` dropdown
- Setting `export_rights` dropdown
- Displaying role-based permissions

## Questions?

Review the comprehensive documentation in `RLS_REBUILD_DOCUMENTATION.md` for:
- Complete access control model
- Testing scenarios
- Troubleshooting guide
- SQL query examples
