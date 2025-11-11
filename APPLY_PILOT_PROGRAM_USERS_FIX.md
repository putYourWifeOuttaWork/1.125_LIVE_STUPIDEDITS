# Quick Fix: Restore Submission Creation

## Problem
Error when creating new submissions:
```
Error creating submission session: relation "pilot_program_users" does not exist
```

## Solution
Apply migration `20251111000000_recreate_pilot_program_users.sql`

## Apply Now (Choose One Method)

### Method 1: Supabase Dashboard (Recommended)
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `supabase/migrations/20251111000000_recreate_pilot_program_users.sql`
3. Paste and run
4. Check output for success message and entry count

### Method 2: Supabase CLI
```bash
cd /path/to/project
supabase db push
```

### Method 3: Direct SQL (if you have psql access)
```bash
psql $DATABASE_URL -f supabase/migrations/20251111000000_recreate_pilot_program_users.sql
```

## What This Does

✅ Recreates `pilot_program_users` table
✅ Auto-populates entries for all users × programs in same company
✅ Sets up triggers for automatic maintenance
✅ All active company users can create submissions

## After Application

Test submission creation:
1. Log in as a regular user
2. Navigate to a site
3. Click "New Submission"
4. Fill out form
5. Click "Start Submission"
6. Should work without "pilot_program_users" error

## Verification Queries

```sql
-- Check table exists and has entries
SELECT COUNT(*) FROM pilot_program_users;

-- Check your own access
SELECT 
  pp.name as program_name,
  ppu.role,
  c.name as company_name
FROM pilot_program_users ppu
JOIN pilot_programs pp ON pp.program_id = ppu.program_id
JOIN companies c ON c.company_id = pp.company_id
WHERE ppu.user_id = auth.uid();

-- Check a specific user (replace with actual user_id)
SELECT 
  u.email,
  pp.name as program_name,
  ppu.role
FROM pilot_program_users ppu
JOIN pilot_programs pp ON pp.program_id = ppu.program_id
JOIN users u ON u.id = ppu.user_id
WHERE ppu.user_id = 'USER_ID_HERE'
ORDER BY pp.name;
```

## Expected Results

For a company with:
- 3 active users
- 5 programs

You should see:
- 15 entries in `pilot_program_users` (3 × 5)
- Each user can access all 5 programs
- Company admins have 'Admin' role
- Regular users have 'Edit' role

## Troubleshooting

### Still getting error after migration?

1. **Check user is active and has company**
```sql
SELECT id, email, is_active, company_id 
FROM users 
WHERE id = auth.uid();
```

2. **Check program has company**
```sql
SELECT program_id, name, company_id 
FROM pilot_programs 
WHERE program_id = 'PROGRAM_ID_HERE';
```

3. **Manually trigger sync for user**
```sql
SELECT sync_pilot_program_users_for_user()
FROM users 
WHERE id = auth.uid();
```

4. **Check entries exist**
```sql
SELECT COUNT(*) 
FROM pilot_program_users 
WHERE user_id = auth.uid();
```

### If no entries for user:
- Ensure `user.is_active = true`
- Ensure `user.company_id IS NOT NULL`
- Ensure programs exist with same `company_id`

## Rollback (Emergency Only)

If this breaks something:
```sql
DROP TABLE IF EXISTS pilot_program_users CASCADE;
DROP FUNCTION IF EXISTS sync_pilot_program_users_for_user() CASCADE;
DROP FUNCTION IF EXISTS sync_pilot_program_users_for_program() CASCADE;
DROP FUNCTION IF EXISTS get_legacy_program_role(UUID) CASCADE;
```

Note: This will break submission creation again.

## Files Created

- Migration: `supabase/migrations/20251111000000_recreate_pilot_program_users.sql`
- Documentation: `PILOT_PROGRAM_USERS_RESTORATION.md` (detailed)
- Quick Guide: `APPLY_PILOT_PROGRAM_USERS_FIX.md` (this file)
