# Fix Migration 00004 Error - Foreign Key Constraint

**Error:** `devices_last_updated_by_user_id_fkey` constraint violation
**Cause:** Column `last_updated_by_user_id` has foreign key to `auth.users(id)`, but system user UUID is not in that table

---

## Quick Fix - Run This SQL

Execute this SQL to fix the constraint issue:

```sql
-- Step 1: Drop the foreign key constraint
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_last_updated_by_user_id_fkey;

-- Step 2: Verify constraint is gone
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE table_name = 'devices'
  AND constraint_name = 'devices_last_updated_by_user_id_fkey';
-- Should return 0 rows

-- Step 3: Now run migration 00004 again
-- Copy the content from: supabase/migrations/20251116000004_system_user_setup.sql
```

---

## Alternative: Use Fixed Migration

If you haven't applied migration 00001 yet, or want to start fresh:

1. **Drop the column if it exists with constraint:**
   ```sql
   ALTER TABLE devices DROP COLUMN IF EXISTS last_updated_by_user_id CASCADE;
   ```

2. **Apply the fixed migration:**
   ```sql
   -- Run: supabase/migrations/20251116000001_add_device_tracking_columns_FIXED.sql
   ```

3. **Then apply the rest:**
   ```sql
   -- Run: 20251116000002_battery_health_trigger.sql
   -- Run: 20251116000003_next_wake_calculation.sql
   -- Run: 20251116000004_system_user_setup.sql
   ```

---

## What Was Fixed

### Before (Broken):
```sql
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS last_updated_by_user_id UUID REFERENCES auth.users(id);
```

❌ **Problem:** Foreign key constraint prevents system UUID (00000000-0000-0000-0000-000000000001) because it's not in `auth.users`

### After (Fixed):
```sql
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS last_updated_by_user_id UUID;
-- NO FOREIGN KEY CONSTRAINT
```

✅ **Solution:**
- Allow any UUID without foreign key validation
- Application logic validates UUIDs against `auth.users` OR `system_users` table
- System user UUID is special case that doesn't need auth.users entry

---

## Verification

After applying the fix, verify:

```sql
-- 1. Check column exists without constraint
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'devices'
  AND column_name = 'last_updated_by_user_id';

-- Should show: last_updated_by_user_id | uuid | YES

-- 2. Check NO foreign key constraint
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'devices'
  AND constraint_name = 'devices_last_updated_by_user_id_fkey';

-- Should return 0 rows

-- 3. Check system_users table exists
SELECT * FROM system_users;

-- Should show system user with UUID 00000000-0000-0000-0000-000000000001

-- 4. Test inserting system UUID (should work now)
UPDATE devices
SET last_updated_by_user_id = '00000000-0000-0000-0000-000000000001'
WHERE device_id = (SELECT device_id FROM devices LIMIT 1);

-- Should succeed without foreign key error
```

---

## Why We Don't Use Foreign Key

**Reason 1:** Supabase doesn't allow direct inserts into `auth.users` table
- `auth.users` is managed by Supabase Auth system
- We can't add our custom system user UUID there

**Reason 2:** System user is a special case
- Represents automated system actions (not a real user)
- Stored in separate `system_users` table
- Needs to coexist with real user UUIDs

**Reason 3:** Application-level validation is sufficient
- Edge functions use `fn_get_system_user_id()` for system UUID
- UI queries user UUID from `supabase.auth.getUser()`
- Both are validated before insertion

**Trade-off:**
- ❌ No database-level foreign key enforcement
- ✅ Flexible enough to support system user AND real users
- ✅ Proper audit trail with clear documentation
- ✅ Application validates UUIDs appropriately

---

## Summary

**Quick Fix (if already applied 00001):**
```sql
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_last_updated_by_user_id_fkey;
```

**Clean Fix (starting fresh):**
Use `20251116000001_add_device_tracking_columns_FIXED.sql` instead of original

Then proceed with remaining migrations (00002, 00003, 00004).
