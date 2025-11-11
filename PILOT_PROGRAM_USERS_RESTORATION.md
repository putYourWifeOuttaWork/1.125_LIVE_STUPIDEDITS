# Pilot Program Users Table Restoration

## Overview

This migration recreates the `pilot_program_users` table to restore compatibility with legacy submission creation functions while maintaining the new company-based access control model.

## What Was Done

### 1. Table Structure
- **Table**: `pilot_program_users`
- **Columns**:
  - `id` (uuid, primary key)
  - `program_id` (uuid, references pilot_programs)
  - `user_id` (uuid, references auth.users)
  - `role` (text, default 'Edit')
  - `created_at` (timestamptz)
  - `user_email` (varchar)
- **Unique Constraint**: (program_id, user_id)

### 2. Automatic Population Logic

The table is **automatically populated** for all combinations of:
- Active users (is_active = true)
- Programs in the same company (user.company_id = program.company_id)

**Role Assignment**:
- `Admin`: Company admins (is_company_admin = true) OR sysAdmins (user_role = 'sysAdmin')
- `Edit`: All other active users (observer, analyst, maintenance roles)

### 3. Auto-Maintenance Triggers

Two triggers keep the table synchronized:

**User Trigger** - Fires when:
- New user is created
- User is activated/deactivated
- User's company changes
- User's role changes (is_company_admin or user_role)

**Program Trigger** - Fires when:
- New program is created
- Program's company changes

### 4. Access Control (RLS)

- Super admins can view all entries
- Regular users can view entries for programs in their company
- System can manage entries (for trigger execution)

## Expected Behavior

### For Submission Creation

✅ **Now Works**: Users can create submissions for any program in their company
- The `create_submission_session` function can query `pilot_program_users`
- All active company users will have entries with 'Edit' or 'Admin' role
- No more "relation pilot_program_users does not exist" error

### Access Model

**Before this migration**:
- Functions expected pilot_program_users table
- Table didn't exist → error on submission creation

**After this migration**:
- Table exists and is auto-populated
- Every active user has access to all programs in their company
- Role is informational (actual permissions from user_role field)

## Migration Application

### File Location
```
supabase/migrations/20251111000000_recreate_pilot_program_users.sql
```

### To Apply
The migration will run automatically when deployed or can be applied manually via:
```bash
# Via Supabase CLI
supabase db push

# Or via SQL editor in Supabase dashboard
# Copy and run the migration file contents
```

### Verification After Application

The migration includes verification that will log:
- Number of entries created
- Number of active users processed
- Number of programs with company_id
- Sample entries showing user → program mappings

Example output:
```
NOTICE: pilot_program_users table successfully recreated
NOTICE: Created 45 entries for 5 active users across 9 programs
NOTICE: Sample entries:
NOTICE:   - user@example.com -> Program A (Admin) [Company: ACME Corp]
NOTICE:   - user2@example.com -> Program A (Edit) [Company: ACME Corp]
```

## Impact Assessment

### ✅ Benefits
1. **Restores legacy function compatibility** - submission creation works again
2. **Zero manual configuration** - table is auto-populated and auto-maintained
3. **Company-scoped access** - users only see programs in their company
4. **Role inheritance** - role field reflects user's actual permissions
5. **Future-proof** - triggers handle new users/programs automatically

### ⚠️ Considerations
1. **Backward compatibility layer** - this is for legacy code support
2. **All company users get access** - no per-program granularity
3. **New code should avoid** - prefer direct company_id checks
4. **Table is managed** - don't manually insert/update entries

### 🔄 Data Flow
```
New User Created → Trigger Fires → Entries Created for All Company Programs
New Program Created → Trigger Fires → Entries Created for All Company Users
User Role Changes → Trigger Fires → Role Field Updated in All Entries
```

## Testing Checklist

After migration application:

- [ ] Verify table exists: `SELECT COUNT(*) FROM pilot_program_users;`
- [ ] Check entries created: Should match (active_users × programs_in_same_company)
- [ ] Test submission creation: Create new submission via UI
- [ ] Verify role mapping: Check Admin vs Edit roles are correct
- [ ] Test new user: Add user to company, verify entries auto-created
- [ ] Test new program: Create program, verify entries auto-created

## Rollback Plan

If issues occur, the table can be dropped:

```sql
DROP TABLE IF EXISTS pilot_program_users CASCADE;
DROP FUNCTION IF EXISTS sync_pilot_program_users_for_user() CASCADE;
DROP FUNCTION IF EXISTS sync_pilot_program_users_for_program() CASCADE;
DROP FUNCTION IF EXISTS get_legacy_program_role(UUID) CASCADE;
```

However, this will break submission creation again until functions are updated to not require the table.

## Future Considerations

### Option 1: Keep as Compatibility Layer (Recommended)
- Maintain the table for legacy function support
- New features use company_id directly
- Gradually refactor functions to remove dependency

### Option 2: Update All Functions
- Refactor create_submission_session and similar functions
- Remove pilot_program_users references
- Use company_id and user_role directly
- Drop compatibility table

## Related Files

- Migration: `supabase/migrations/20251111000000_recreate_pilot_program_users.sql`
- Session Manager: `src/lib/sessionManager.ts`
- Submission Page: `src/pages/NewSubmissionPage.tsx`
- Archive Table: `pilot_program_users_archive` (contains historical data)

## Support

If submission creation still fails after this migration:
1. Check that user has `company_id` set
2. Verify user is `is_active = true`
3. Check that program has `company_id` matching user's company
4. Query: `SELECT * FROM pilot_program_users WHERE user_id = auth.uid();`
5. Review error logs for specific function failures
