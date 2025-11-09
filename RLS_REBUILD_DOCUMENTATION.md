# RLS Rebuild Documentation

## Overview

This document describes the complete rebuild of the Row-Level Security (RLS) system for the multi-tenant application. The rebuild replaces the complex `pilot_program_users` based access control with a streamlined role-based system tied to company membership.

## Migration Files

The RLS rebuild is implemented across multiple migration files:

1. **20251109130000_complete_rls_rebuild.sql** - Schema updates, policy removal, helper functions
2. **20251109130001_rls_policies_all_tables.sql** - RLS policies for main tables
3. **20251109130002_rls_policies_history_and_supporting.sql** - RLS policies for history/audit tables
4. **20251109130003_remove_pilot_program_users.sql** - Removal of pilot_program_users table

## Key Changes

### 1. Schema Changes

#### New Fields on `users` Table

- **`export_rights`** (enum): Controls data export permissions
  - Values: `none`, `history`, `history_and_analytics`, `all`
  - Default: `none`

- **`user_role`** (enum): Defines operational permissions
  - Values: `observer`, `analyst`, `maintenance`, `sysAdmin`
  - Default: `observer`

#### New Trigger

- **`sync_company_name_trigger`**: Automatically updates `users.company` text field to match the company name from `companies.name` based on `company_id`

### 2. Removed Components

- **`pilot_program_users` table**: No longer needed for access control
  - Data archived to `pilot_program_users_archive` table
  - Access now controlled by company membership + user_role

### 3. New Helper Functions

| Function | Purpose |
|----------|---------|
| `is_user_active()` | Check if user account is active |
| `get_user_company_id()` | Get user's company_id |
| `is_super_admin()` | Check super admin privileges |
| `is_company_admin()` | Check company admin flag |
| `get_user_role()` | Get user's role enum value |
| `has_role(role)` | Check if user has specific role or higher |
| `can_export(level)` | Validate export permissions |
| `validate_rls_setup()` | Check RLS is properly enabled |

## Access Control Model

### Role Hierarchy

The access control model is based on **company membership** plus **user roles**:

```
┌─────────────────────────────────────────────────┐
│              Super Admin (Global)                │
│  - Full CRUD across all companies               │
│  - All export rights enabled                    │
│  - Can manage all users                         │
└─────────────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
┌───────────────────┐      ┌────────────────────┐
│  Company Admin    │      │    SysAdmin Role   │
│  (is_company_     │      │  (user_role =      │
│   admin = true)   │      │   'sysAdmin')      │
│                   │      │                    │
│  Combined: Full export   │  Separate: Export  │
│  rights for company      │  based on field    │
└───────────────────┘      └────────────────────┘
        │                               │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┴───────────────────────┐
        │                                       │
┌───────────────────┐      ┌────────────────────┐
│  Maintenance      │      │    Analyst         │
│  - Device mgmt    │      │  - Read ALL data   │
│  - Delete sessions│      │  - View history    │
│  - No image delete│      │  - Write obs.      │
└───────────────────┘      └────────────────────┘
        │                               │
        └───────────────┬───────────────┘
                        │
                ┌───────────────┐
                │   Observer    │
                │ - Read data   │
                │ - Write obs.  │
                │ - No delete   │
                └───────────────┘
```

### Permission Matrix

| Action | Observer | Analyst | Maintenance | SysAdmin | Company Admin | Super Admin |
|--------|----------|---------|-------------|----------|---------------|-------------|
| **Programs** |
| View company programs | ✓ | ✓ | ✓ | ✓ | ✓ | All |
| Create programs | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Update programs | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Delete programs | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| **Sites** |
| View company sites | ✓ | ✓ | ✓ | ✓ | ✓ | All |
| Create/Update sites | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Delete sites | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| **Submissions** |
| View company submissions | ✓ | ✓ | ✓ | ✓ | ✓ | All |
| Create submissions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Update submissions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Delete submissions | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| **Observations** |
| View observations | ✓ | ✓ | ✓ | ✓ | ✓ | All |
| Create observations | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Update observations | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Delete observations | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| **Devices** |
| View devices | ✓ | ✓ | ✓ | ✓ | ✓ | All |
| Create/Update devices | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Delete devices | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Manage device assignments | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Delete device images | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| **History/Audit** |
| View history tables | ✗ | ✓ | ✗ | ✓ | ✓ | All |
| Modify history | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Users** |
| View company users | ✓ | ✓ | ✓ | ✓ | ✓ | All |
| Manage company users | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Grant super_admin | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

### Export Rights

Export permissions are controlled separately via the `export_rights` field:

| Export Level | Access Granted |
|--------------|----------------|
| `none` | No data export allowed |
| `history` | Can export audit logs and history records |
| `history_and_analytics` | Can export history + analytics reports |
| `all` | Can export all data including raw observations |

**Special Rules:**
- Super admins automatically have `all` export rights
- Company admin + sysAdmin role = automatic `all` export rights for their company
- All other combinations use the `export_rights` field value

## Security Principles

### 1. Company Isolation

Every table with a `company_id` column enforces strict company isolation:

```sql
-- Example: Users can only view data in their company
USING (
  is_user_active()
  AND (
    is_super_admin()  -- Exception for super admins
    OR company_id = get_user_company_id()  -- Strict company match
  )
)
```

### 2. Active User Requirement

All policies require `is_user_active()` to be true:

```sql
USING (
  is_user_active()  -- First check: is the user active?
  AND ...  -- Additional permission checks
)
```

Deactivated users are immediately blocked from all operations.

### 3. Principle of Least Privilege

- Users start with minimal permissions (observer role)
- Permissions are progressively granted based on role
- Delete operations are restricted to maintenance+ roles
- History tables are read-only for all users

### 4. Audit Trail Integrity

- History tables (`pilot_program_history`, `device_history`) have no user INSERT/UPDATE/DELETE policies
- Only system triggers can write to history tables
- Analysts and admins can read history for analysis
- No one can modify or delete history records

## Migration Process

### Pre-Migration Checklist

- [ ] Backup database completely
- [ ] Review current `pilot_program_users` table data
- [ ] Identify users who should be assigned specific roles
- [ ] Plan user_role assignments for existing users
- [ ] Review export_rights assignments needed
- [ ] Test migrations on staging environment
- [ ] Communicate changes to users

### Migration Steps

1. **Run Migration 1**: Schema updates and policy removal
   ```bash
   # This will add export_rights, update user_role, create trigger
   # Drop all existing RLS policies and helper functions
   ```

2. **Run Migration 2**: Core table RLS policies
   ```bash
   # Implements RLS for programs, sites, submissions, observations, devices
   ```

3. **Run Migration 3**: History and supporting table RLS policies
   ```bash
   # Implements RLS for history, assignments, sessions, reports
   ```

4. **Run Migration 4**: Remove pilot_program_users table
   ```bash
   # Archives and removes pilot_program_users table
   ```

5. **Verify RLS Setup**:
   ```sql
   SELECT * FROM validate_rls_setup();
   ```

6. **Update User Roles**:
   ```sql
   -- Example: Assign roles to users
   UPDATE users SET user_role = 'analyst' WHERE email = 'analyst@company.com';
   UPDATE users SET user_role = 'maintenance' WHERE email = 'tech@company.com';
   UPDATE users SET export_rights = 'history_and_analytics' WHERE user_role = 'analyst';
   ```

### Post-Migration Tasks

- [ ] Verify all users can access their company data
- [ ] Test each role's permissions
- [ ] Verify company isolation is working
- [ ] Test export_rights enforcement
- [ ] Update frontend code to remove pilot_program_users references
- [ ] Update user management UI
- [ ] Document new role assignments process

## Testing Scenarios

### Test Case 1: Company Isolation

```sql
-- Login as user in Company A
SELECT * FROM pilot_programs;  -- Should only see Company A programs
SELECT * FROM sites;           -- Should only see Company A sites
SELECT * FROM devices;         -- Should only see Company A devices
```

### Test Case 2: Observer Role

```sql
-- Login as observer role user
INSERT INTO submissions (...);       -- Should succeed
UPDATE petri_observations (...);    -- Should succeed
DELETE FROM submissions WHERE ...;  -- Should fail (no delete permission)
INSERT INTO devices (...);          -- Should fail (no device management)
```

### Test Case 3: Analyst Role

```sql
-- Login as analyst role user
SELECT * FROM pilot_program_history; -- Should succeed (can view history)
SELECT * FROM device_history;        -- Should succeed
INSERT INTO custom_reports (...);    -- Should succeed (can create reports)
DELETE FROM devices WHERE ...;       -- Should fail (no device delete)
```

### Test Case 4: Maintenance Role

```sql
-- Login as maintenance role user
INSERT INTO devices (...);           -- Should succeed
UPDATE device_site_assignments (...); -- Should succeed
DELETE FROM submissions WHERE ...;   -- Should succeed
DELETE FROM device_images WHERE ...; -- Should fail (only sysAdmin can delete images)
```

### Test Case 5: Deactivated User

```sql
-- Set user to inactive
UPDATE users SET is_active = false WHERE id = '...';

-- Login as deactivated user
SELECT * FROM pilot_programs;        -- Should return no rows (blocked by RLS)
```

### Test Case 6: Export Rights

```sql
-- Test export permissions
SELECT can_export('none');                    -- Anyone can pass 'none' check
SELECT can_export('history');                 -- Only users with history+ rights
SELECT can_export('history_and_analytics');   -- Only users with analytics+ rights
SELECT can_export('all');                     -- Only users with 'all' rights or super/double admins
```

## Rollback Procedure

If critical issues are discovered, use the rollback script:

```bash
psql -d your_database < supabase/RLS_REBUILD_ROLLBACK.sql
```

**Warning**: Rollback will:
- Restore `pilot_program_users` table from archive
- Remove new RLS policies
- Restore basic old helper functions and policies
- Optionally remove `export_rights` field

## Frontend Updates Required

### 1. Remove pilot_program_users References

Files likely needing updates:
- `src/hooks/useUserProfile.ts` - Remove pilot_program_users queries
- `src/hooks/usePilotPrograms.ts` - Update to rely on company membership
- `src/components/users/ProgramUsersModal.tsx` - May need removal or rework
- Any components managing program-level user access

### 2. Update User Management UI

Add controls for:
- Setting `user_role` (observer, analyst, maintenance, sysAdmin)
- Setting `export_rights` (none, history, history_and_analytics, all)
- Display role-based permissions clearly

### 3. Update Type Definitions

Update `src/lib/types.ts`:
```typescript
export type UserRole = 'observer' | 'analyst' | 'maintenance' | 'sysAdmin';
export type ExportRights = 'none' | 'history' | 'history_and_analytics' | 'all';

export type UserProfile = {
  // ... existing fields
  user_role: UserRole;
  export_rights: ExportRights;
  is_company_admin: boolean;
  is_super_admin: boolean;
  is_active: boolean;
};
```

### 4. Add Role-Based UI Logic

```typescript
// Example: Check if user can manage devices
const canManageDevices = userRole === 'maintenance' || userRole === 'sysAdmin' || isCompanyAdmin || isSuperAdmin;

// Example: Check if user can view history
const canViewHistory = userRole === 'analyst' || userRole === 'sysAdmin' || isCompanyAdmin || isSuperAdmin;

// Example: Check export permissions
const canExportData = exportRights !== 'none' || isSuperAdmin || (isCompanyAdmin && userRole === 'sysAdmin');
```

## Troubleshooting

### Issue: User cannot see any data after migration

**Diagnosis**: User may be deactivated or company_id is not set

**Solution**:
```sql
-- Check user status
SELECT id, email, is_active, company_id, user_role FROM users WHERE email = 'user@example.com';

-- Activate user if needed
UPDATE users SET is_active = true WHERE email = 'user@example.com';

-- Set company_id if missing
UPDATE users SET company_id = '<company-uuid>' WHERE email = 'user@example.com';
```

### Issue: Company admin cannot see all company data

**Diagnosis**: is_company_admin flag may not be set

**Solution**:
```sql
-- Grant company admin privileges
UPDATE users SET is_company_admin = true WHERE email = 'admin@example.com';
```

### Issue: User can see data from other companies

**Diagnosis**: RLS policies may not be enabled or super_admin flag is set

**Solution**:
```sql
-- Check if RLS is enabled
SELECT * FROM validate_rls_setup();

-- Check if user is super admin
SELECT is_super_admin FROM users WHERE email = 'user@example.com';

-- Remove super admin if incorrectly set
UPDATE users SET is_super_admin = false WHERE email = 'user@example.com';
```

### Issue: History tables return no data for analysts

**Diagnosis**: User role may not be set to analyst or higher

**Solution**:
```sql
-- Upgrade user to analyst role
UPDATE users SET user_role = 'analyst' WHERE email = 'analyst@example.com';
```

## Support and Questions

For questions or issues with the RLS rebuild:

1. Check this documentation first
2. Review the validation output: `SELECT * FROM validate_rls_setup();`
3. Test with the provided test cases
4. Use the rollback script if critical issues arise

## Appendix: SQL Queries for Common Tasks

### Assign User Roles in Bulk

```sql
-- Assign analyst role to all users in analytics department
UPDATE users
SET user_role = 'analyst', export_rights = 'history_and_analytics'
WHERE email LIKE '%analytics@%';

-- Assign maintenance role to technical staff
UPDATE users
SET user_role = 'maintenance'
WHERE email IN ('tech1@company.com', 'tech2@company.com');
```

### Grant Company Admin Privileges

```sql
-- Make user a company admin
UPDATE users
SET is_company_admin = true, user_role = 'sysAdmin'
WHERE email = 'admin@company.com';
```

### Audit User Access

```sql
-- List all users and their access levels by company
SELECT
  c.name as company_name,
  u.email,
  u.is_active,
  u.is_company_admin,
  u.is_super_admin,
  u.user_role,
  u.export_rights
FROM users u
JOIN companies c ON c.company_id = u.company_id
ORDER BY c.name, u.is_company_admin DESC, u.user_role;
```

### Verify Company Isolation

```sql
-- Count records by company across all tables
SELECT
  'pilot_programs' as table_name,
  c.name as company_name,
  COUNT(*) as record_count
FROM pilot_programs p
JOIN companies c ON c.company_id = p.company_id
GROUP BY c.name
UNION ALL
SELECT 'sites', c.name, COUNT(*)
FROM sites s
JOIN companies c ON c.company_id = s.company_id
GROUP BY c.name
ORDER BY company_name, table_name;
```
