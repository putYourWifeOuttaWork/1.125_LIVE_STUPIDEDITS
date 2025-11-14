# Session Creation Fix - Deployment Guide

## Problem Summary

Daily automatic session creation has been failing since November 12, 2025 due to three critical bugs:

1. **Enum Error**: `odor_distance_enum` missing `'None'` value
2. **Enum Error**: `airflow_enum` missing `'Moderate'` value
3. **Check Constraint Error**: `submissions_creator_check` requires either `created_by` OR `created_by_device_id` to be NOT NULL, but the device submission shell function was setting both to NULL

## Solution Created

Created comprehensive fix at: `supabase/migrations/20251114000000_fix_session_creation.sql`

The fix includes:
1. Adds missing `'None'` value to `odor_distance_enum`
2. Adds missing `'Moderate'` value to `airflow_enum`
3. Creates a virtual "SYSTEM" device to act as creator for auto-generated submissions
4. Updates `fn_get_or_create_device_submission()` function to use the SYSTEM device as creator

## Deployment Steps

### Step 1: Apply the Migration

**Option A: Via Supabase Dashboard (Recommended)**

1. Open Supabase Dashboard → SQL Editor
2. Copy the entire contents of `supabase/migrations/20251114000000_fix_session_creation.sql`
3. Paste into SQL Editor
4. Click "Run"
5. Verify no errors in output

**Option B: Via Command Line** (if you have Supabase CLI configured)

```bash
# From project root
supabase db push
```

### Step 2: Verify the Fix

Run this test query in SQL Editor:

```sql
SELECT auto_create_daily_sessions();
```

Expected result:
```json
{
  "success": true,
  "success_count": 2,  -- Should match number of active sites with devices
  "error_count": 0,
  "total_sites": 2
}
```

### Step 3: Check Sessions Were Created

```sql
SELECT
  session_date,
  sites.name as site_name,
  status,
  expected_wake_count,
  completed_wake_count
FROM site_device_sessions
JOIN sites USING (site_id)
WHERE session_date = CURRENT_DATE
ORDER BY sites.name;
```

Expected output: Should show 2 sessions (one for "Test Site for IoT Device" and one for "Greenhouse #1")

### Step 4: Backfill Missing Sessions

Run the auto-creation function once to create today's sessions:

```sql
SELECT auto_create_daily_sessions();
```

For Nov 13 (if needed):
```sql
-- This will need custom scripting as the function uses CURRENT_DATE
-- Better to just move forward with today's session
```

### Step 5: Set Up Automated Scheduling

Choose ONE of these options:

#### Option A: Supabase Edge Functions + External Cron (Recommended)

1. Deploy the edge function:
   - The function already exists at `supabase/functions/auto_create_daily_sessions.ts`
   - It's ready to deploy

2. Set up external cron service (e.g., cron-job.org, GitHub Actions, Vercel Cron):
   - Schedule: Daily at 00:00 UTC (midnight)
   - URL: `https://jycxolmevsvrxmeinxff.supabase.co/functions/v1/auto_create_daily_sessions`
   - Method: POST
   - Headers:
     ```
     Authorization: Bearer <SUPABASE_ANON_KEY>
     Content-Type: application/json
     ```

#### Option B: pg_cron (If Available)

Run in SQL Editor:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily session creation at midnight UTC
SELECT cron.schedule(
  'auto-create-device-sessions-daily',
  '0 0 * * *',
  $$ SELECT auto_create_daily_sessions(); $$
);

-- Verify it's scheduled
SELECT * FROM cron.job;
```

Note: pg_cron may not be available in all Supabase instances.

### Step 6: Monitor Session Creation

Check the logs table:

```sql
SELECT
  execution_time,
  total_sites,
  success_count,
  error_count,
  execution_duration_ms,
  details
FROM session_creation_log
ORDER BY execution_time DESC
LIMIT 10;
```

##  Verification Checklist

- [ ] Migration applied successfully
- [ ] Test execution of `auto_create_daily_sessions()` returned success
- [ ] Sessions created for today for both active sites
- [ ] Scheduled automation configured (cron job or edge function)
- [ ] Monitoring in place (session_creation_log table)

## Testing Script

Run this to verify everything is working:

```bash
node diagnose-and-fix-sessions.mjs
```

Expected output:
- ✅ 2 sites with active devices found
- ✅ Function executes without errors
- ✅ Sessions exist for today
- ✅ No gap in missing sessions

## Troubleshooting

### If sessions still fail to create:

1. Check the `session_creation_log` table for error details
2. Verify SYSTEM device was created:
   ```sql
   SELECT * FROM devices WHERE device_mac = 'SYSTEM:AUTO:GENERATED';
   ```
3. Check enum values were added:
   ```sql
   SELECT enumlabel FROM pg_enum WHERE enumtypid = 'odor_distance_enum'::regtype;
   SELECT enumlabel FROM pg_enum WHERE enumtypid = 'airflow_enum'::regtype;
   ```

### If enum values are still missing:

Run these individually:

```sql
ALTER TYPE odor_distance_enum ADD VALUE IF NOT EXISTS 'None';
ALTER TYPE airflow_enum ADD VALUE IF NOT EXISTS 'Moderate';
```

### If SYSTEM device is missing:

Run the device creation block from the migration file manually.

## Next Steps After Deployment

1. Monitor for 24-48 hours to ensure daily sessions are created automatically
2. Verify device data is being collected and linked to sessions properly
3. Check that the session counters (expected_wake_count, completed_wake_count) are updating correctly
4. Review any alerts generated in the `device_alerts` table

## Files Created

- `supabase/migrations/20251114000000_fix_session_creation.sql` - The migration fix
- `SESSION_CREATION_FIX_DEPLOYMENT_GUIDE.md` - This guide
- `diagnose-and-fix-sessions.mjs` - Testing/verification script

## Support

If issues persist after applying this fix, check:
- Supabase logs for function execution errors
- RLS policies on relevant tables (sites, devices, submissions)
- Company context and user permissions

---

**Last Updated**: November 14, 2025
**Status**: Ready for deployment
