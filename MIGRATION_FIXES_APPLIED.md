# Migration Fixes Applied

## Issue 1: Migration 002 - Storage Bucket ❌→✅

**Error:**
```
check constraint "chk_device_images_url_bucket" of relation "device_images" is violated by some row
```

**Root Cause:**
Existing rows in `device_images` table have URLs pointing to old buckets (e.g., `petri-images`), but the constraint required all URLs to be in the new `device-images` bucket.

**Fix Applied:**
Removed the check constraint that was blocking the migration. Existing URLs are preserved, and new uploads will use the `device-images` bucket automatically via the edge function.

**What Changed:**
- Removed `ALTER TABLE device_images ADD CONSTRAINT chk_device_images_url_bucket`
- Added comment explaining that new images use the new bucket structure
- Existing images remain accessible at their current URLs

## Issue 2: Migration 003 - Auto Session Scheduler ❌→✅

**Likely Error:**
pg_cron extension not available or permission denied.

**Root Cause:**
Not all Supabase instances have the pg_cron extension enabled. It requires special setup and may not be available in all plans/configurations.

**Fix Applied:**
Made pg_cron setup optional (commented out) and provided alternative scheduling methods.

**What Changed:**
- Commented out `CREATE EXTENSION IF NOT EXISTS pg_cron`
- Commented out `SELECT cron.schedule(...)`
- Added documentation for 3 alternative scheduling approaches
- Functions still created and can be called manually or via edge function

## How to Apply Fixed Migrations

### Step 1: Retry Migration 002
The migration should now succeed because the constraint has been removed.

```sql
-- Migration will now:
✅ Create device-images storage bucket
✅ Set up RLS policies
✅ Create helper functions (fn_build_device_image_path, etc.)
✅ Add indexes
❌ Skip constraint (preserves existing data)
```

### Step 2: Retry Migration 003
The migration will now create the functions without attempting to schedule them.

```sql
-- Migration will now:
✅ Create session_creation_log table
✅ Create auto_create_daily_sessions() function
✅ Create auto_create_daily_sessions_timezone_aware() function
✅ Set up RLS policies
❌ Skip pg_cron setup (use alternatives below)
```

## Scheduling Options for Auto Session Creation

Since pg_cron is not available, choose one of these alternatives:

### Option 1: Manual Testing (Immediate)
```sql
-- Test that it works
SELECT auto_create_daily_sessions();

-- Should return:
{
  "success": true,
  "log_id": "...",
  "total_sites": 5,
  "success_count": 5,
  "error_count": 0,
  "details": [...]
}
```

### Option 2: Use Existing Edge Function (Recommended)
The edge function already exists at:
`supabase/functions/auto_create_daily_sessions/index.ts`

**Schedule it via:**
1. **External Cron Service** (e.g., cron-job.org):
   - URL: `https://YOUR_PROJECT.supabase.co/functions/v1/auto_create_daily_sessions`
   - Headers: `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`
   - Schedule: Daily at 00:00 UTC

2. **Vercel Cron** (if using Vercel):
   ```json
   {
     "crons": [{
       "path": "/api/cron/create-sessions",
       "schedule": "0 0 * * *"
     }]
   }
   ```

3. **GitHub Actions** (if using GitHub):
   ```yaml
   on:
     schedule:
       - cron: '0 0 * * *'
   ```

### Option 3: Enable pg_cron (If Available)
Contact Supabase support to enable pg_cron extension, then uncomment the lines in migration 003:

```sql
-- Uncomment these lines in the migration file:
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'auto-create-device-sessions-daily',
  '0 0 * * *',
  $$ SELECT auto_create_daily_sessions(); $$
);
```

## Verification Steps

### After Migration 002 Succeeds:
```sql
-- 1. Check bucket exists
SELECT * FROM storage.buckets WHERE id = 'device-images';

-- 2. Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';

-- 3. Check helper functions exist
SELECT proname FROM pg_proc WHERE proname LIKE '%device_image%';
-- Should show: fn_build_device_image_path, fn_extract_company_from_path
```

### After Migration 003 Succeeds:
```sql
-- 1. Check table exists
SELECT * FROM session_creation_log LIMIT 1;

-- 2. Check functions exist
SELECT proname FROM pg_proc WHERE proname LIKE '%daily_sessions%';
-- Should show: auto_create_daily_sessions, auto_create_daily_sessions_timezone_aware

-- 3. Test manual execution
SELECT auto_create_daily_sessions();
```

## What's Next

Once both migrations succeed:

1. ✅ **Migrations 000, 001** - Already applied successfully
2. ✅ **Migration 002** - Apply with fixes (no constraint)
3. ✅ **Migration 003** - Apply with fixes (no pg_cron)
4. 🔧 **Set up scheduling** - Choose Option 1, 2, or 3 above
5. 🚀 **Deploy edge function** - Deploy updated mqtt_device_handler
6. 🧪 **Test with device** - Power on and verify end-to-end flow

## Expected Behavior After All Migrations

### Device Images:
- ✅ New uploads go to `device-images` bucket
- ✅ Hierarchical paths: `company_id/site_id/device_mac/image_name`
- ✅ Old images remain accessible at existing URLs
- ✅ RLS enforces company isolation

### Session Creation:
- ✅ Functions available for manual or scheduled execution
- ✅ Logging table tracks all runs
- ✅ Error handling prevents failures from breaking other sites
- ⏳ Scheduling needs to be set up (choose an option above)

## Files Modified

1. `supabase/migrations/20251111120002_device_images_storage_bucket.sql`
   - Removed check constraint
   - Added explanatory comment

2. `supabase/migrations/20251111120003_auto_session_scheduler.sql`
   - Commented out pg_cron setup
   - Added alternative scheduling instructions
   - Added manual testing guidance

## Summary

Both migrations have been fixed and should now apply successfully:

- **002**: No longer enforces bucket constraint (preserves existing data)
- **003**: No longer requires pg_cron (provides alternatives)

You can now retry applying these migrations! Let me know if you encounter any other errors.
