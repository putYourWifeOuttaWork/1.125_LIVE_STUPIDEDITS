# Migration Error Fixed

## Issue

When running `APPLY_PENDING_IMAGE_PROTOCOL_STATE.sql`, you encountered:
```
ERROR: 42703: column "protocol_state" does not exist
```

## Root Cause

The migration was trying to update a CHECK constraint on the `protocol_state` column, but that column didn't exist yet in your database. This means the original migration (`20260103220000_add_protocol_state_to_wake_payloads.sql`) hadn't been applied.

## Solution Applied

Updated `APPLY_PENDING_IMAGE_PROTOCOL_STATE.sql` to be a **complete, idempotent migration** that:

### ✅ Now Includes Everything

1. **Creates all columns** (if they don't exist):
   - `protocol_state`
   - `server_image_name`
   - `ack_sent_at`
   - `snap_sent_at`
   - `sleep_sent_at`

2. **Adds CHECK constraint** with all states including new `ack_pending_sent`

3. **Creates index** for efficient protocol state queries

4. **Migrates existing data** to set appropriate states

5. **Updates documentation** with column comments

### ✅ Safe to Run Multiple Times

The migration now uses:
- `ADD COLUMN IF NOT EXISTS` - Won't fail if columns exist
- `DROP CONSTRAINT IF EXISTS` - Won't fail if constraint doesn't exist
- `CREATE INDEX IF NOT EXISTS` - Won't fail if index exists
- `WHERE protocol_state IS NULL` - Only updates records that need it

## How to Apply

Run the **updated** `APPLY_PENDING_IMAGE_PROTOCOL_STATE.sql` in Supabase Dashboard:

1. Open Supabase Dashboard → SQL Editor
2. Copy **entire contents** of `APPLY_PENDING_IMAGE_PROTOCOL_STATE.sql`
3. Paste and run
4. Should complete successfully with no errors

## What Changed in the File

**Before** (only updated constraint):
```sql
-- Drop existing constraint
ALTER TABLE device_wake_payloads
DROP CONSTRAINT IF EXISTS device_wake_payloads_protocol_state_check;

-- Add updated constraint
ALTER TABLE device_wake_payloads
ADD CONSTRAINT device_wake_payloads_protocol_state_check
CHECK (protocol_state IN (...));
```

**After** (complete setup):
```sql
-- Step 1: Create columns if missing
ALTER TABLE device_wake_payloads
ADD COLUMN IF NOT EXISTS protocol_state TEXT;
-- ... (all columns)

-- Step 2: Drop existing constraint
-- Step 3: Add updated constraint
-- Step 4: Create index
-- Step 5: Migrate existing data
-- Step 6: Add comments
```

## Verification

After running the migration, verify it worked:

```sql
-- Check columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'device_wake_payloads'
  AND column_name IN ('protocol_state', 'server_image_name', 'ack_sent_at', 'snap_sent_at', 'sleep_sent_at');

-- Should return 5 rows

-- Check constraint exists
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'device_wake_payloads'
  AND constraint_name = 'device_wake_payloads_protocol_state_check';

-- Should return 1 row

-- Check index exists
SELECT indexname
FROM pg_indexes
WHERE tablename = 'device_wake_payloads'
  AND indexname = 'idx_device_wake_payloads_protocol_state';

-- Should return 1 row
```

## Next Steps

1. ✅ Migration file fixed
2. ⏳ Run updated migration in Supabase Dashboard
3. ⏳ Deploy updated MQTT edge function
4. ⏳ Test pending image resume flow

The code is ready to go - just need to apply the database migration and deploy!
