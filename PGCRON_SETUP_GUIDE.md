# pg_cron Setup Guide - Native Supabase Scheduling

**Status:** ✅ Ready to Deploy (Much Better Than External Cron!)

---

## What is pg_cron?

**pg_cron** is a PostgreSQL extension built into Supabase that allows you to schedule jobs directly in the database. No external services needed!

### Benefits vs External Cron:
- ✅ **Native** - Built into Supabase, no third-party services
- ✅ **Secure** - Runs within your database, uses existing RLS
- ✅ **Reliable** - Managed by Supabase infrastructure
- ✅ **Observable** - View history directly in database
- ✅ **Free** - No additional services or costs

---

## Setup (2 Easy Steps)

### Step 1: Apply the Migration

Copy and run this in Supabase SQL Editor:
```
supabase/migrations/20251117000005_setup_pgcron_midnight_jobs.sql
```

This will:
1. Enable pg_cron extension
2. Schedule the midnight jobs (0 0 * * * UTC)
3. Create helper functions to view jobs and history

### Step 2: Verify It's Working

```sql
-- View scheduled jobs
SELECT * FROM get_scheduled_cron_jobs();

-- Expected output:
-- jobid | jobname                 | schedule    | active | command
-- ------|-------------------------|-------------|--------|----------
-- 1     | midnight-session-jobs   | 0 0 * * *   | true   | DO $$ ...
```

---

## What It Does

Every day at **midnight UTC**, the scheduled job:

1. **Locks expired sessions** (`lock_all_expired_sessions()`)
   - Submission sessions from previous days → 'Completed'
   - Device sessions past their end time → 'locked'

2. **Creates new device sessions** (`auto_create_daily_sessions()`)
   - For each site with active devices
   - Sets up session tracking for the day
   - Calculates expected wake counts

3. **Logs results**
   - Success/failure logged to PostgreSQL logs
   - Viewable via `get_cron_job_history()`

---

## Monitoring & Management

### View All Scheduled Jobs
```sql
SELECT * FROM get_scheduled_cron_jobs();
```

### View Recent Job Runs
```sql
-- Last 10 runs
SELECT * FROM get_cron_job_history(10);

-- Expected columns:
-- - run_start: When job started
-- - run_end: When job completed
-- - status: 'succeeded' or 'failed'
-- - return_message: Any output/errors
-- - duration: How long it took
```

### Check Session Creation Logs
```sql
SELECT *
FROM session_creation_log
ORDER BY execution_time DESC
LIMIT 5;
```

### Manually Trigger (Testing)
```sql
-- Test lock function
SELECT * FROM lock_all_expired_sessions();

-- Test creation function
SELECT * FROM auto_create_daily_sessions();
```

---

## Troubleshooting

### Job Not Running?

1. **Check if job exists:**
```sql
SELECT * FROM cron.job WHERE jobname = 'midnight-session-jobs';
```

2. **Check job run history:**
```sql
SELECT * FROM get_cron_job_history(10);
```

3. **Check for errors:**
```sql
SELECT *
FROM get_cron_job_history(10)
WHERE status != 'succeeded';
```

### Reschedule Job

```sql
-- Unschedule
SELECT cron.unschedule('midnight-session-jobs');

-- Reschedule (e.g., different time)
SELECT cron.schedule(
  'midnight-session-jobs',
  '0 1 * * *',  -- 1 AM UTC instead
  $$ /* job code */ $$
);
```

### Disable Job Temporarily

```sql
-- Disable
UPDATE cron.job
SET active = false
WHERE jobname = 'midnight-session-jobs';

-- Enable
UPDATE cron.job
SET active = true
WHERE jobname = 'midnight-session-jobs';
```

---

## Testing Before Midnight

You can manually test the functions that will run at midnight:

```sql
-- Test entire flow
DO $$
DECLARE
  v_lock_result JSONB;
  v_create_result JSONB;
BEGIN
  -- Lock expired
  SELECT lock_all_expired_sessions() INTO v_lock_result;
  RAISE NOTICE 'Lock result: %', v_lock_result;

  -- Create new
  SELECT auto_create_daily_sessions() INTO v_create_result;
  RAISE NOTICE 'Create result: %', v_create_result;
END $$;
```

---

## Cron Schedule Examples

If you want to change the schedule:

```sql
'0 0 * * *'     -- Midnight UTC daily (current)
'0 1 * * *'     -- 1 AM UTC daily
'30 23 * * *'   -- 11:30 PM UTC daily
'0 0 * * 0'     -- Midnight UTC on Sundays only
'0 */6 * * *'   -- Every 6 hours
'*/30 * * * *'  -- Every 30 minutes (testing)
```

Use [crontab.guru](https://crontab.guru/) to test schedules.

---

## What Gets Logged

### PostgreSQL Logs (via pg_cron)
- Job start/end times
- Status (succeeded/failed)
- Return messages
- Duration

### Custom Application Logs
- `session_creation_log` table
  - Total sites processed
  - Success/error counts
  - Detailed results
  - Execution duration

### Notices (visible in logs)
```
🌙 Midnight Jobs: Starting at 2025-11-18 00:00:00
🔒 Locked 3 sessions
📝 Created 12 sessions
✅ Midnight Jobs: Complete - Locked: 3, Created: 12
```

---

## Advantages of pg_cron vs Edge Function + External Cron

| Feature | pg_cron (Native) | Edge Function + External |
|---------|------------------|--------------------------|
| **Cost** | ✅ Free | ⚠️ May have costs |
| **Setup** | ✅ 1 migration | ❌ 2 services to configure |
| **Security** | ✅ Internal only | ⚠️ Exposes public endpoint |
| **Reliability** | ✅ Managed by Supabase | ⚠️ Depends on 3rd party |
| **Monitoring** | ✅ Built-in history | ❌ External logs |
| **Latency** | ✅ No network calls | ⚠️ HTTP overhead |
| **Maintenance** | ✅ Zero | ⚠️ Monitor 2 services |

---

## Summary

✅ **Apply migration 20251117000005** to set up pg_cron

✅ **No external services needed**

✅ **Automatic daily execution at midnight UTC**

✅ **Monitor with SQL queries**

✅ **Production-ready and reliable**

---

## Next Steps After Setup

1. Apply the migration
2. Verify job is scheduled: `SELECT * FROM get_scheduled_cron_jobs();`
3. Wait until midnight (or test manually)
4. Check results next morning: `SELECT * FROM get_cron_job_history(10);`
5. View created sessions: `SELECT * FROM site_device_sessions WHERE session_date = CURRENT_DATE;`

That's it! The system will now run automatically every night. 🌙
