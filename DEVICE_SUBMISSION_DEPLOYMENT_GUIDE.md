# Device Submission System - Deployment Guide

## Overview

Phase 1 and Phase 2 implementation is complete! This guide will help you deploy the new device submission system to your Supabase database.

## What's Been Created

### ✅ Database Schema (3 Migration Files)

1. **20251110000000_create_device_submission_system.sql**
   - `site_device_sessions` table (daily fleet containers)
   - `device_wake_payloads` table (per-wake event records)
   - `device_schedule_changes` table (midnight-effective schedule queue)
   - Extensions to `devices` and `device_images` tables

2. **20251110000001_device_submission_functions.sql**
   - `fn_midnight_session_opener()` - Create daily sessions
   - `fn_end_of_day_locker()` - Lock sessions and generate alerts
   - `fn_wake_ingestion_handler()` - Process device wake metadata
   - Helper functions for cron parsing and wake window inference

3. **20251110000002_device_submission_handlers.sql**
   - `fn_image_completion_handler()` - Handle successful transmissions
   - `fn_image_failure_handler()` - Handle failed transmissions
   - `fn_retry_by_id_handler()` - Process image retry requests
   - Bulk functions for all-sites automation

### 📋 Key Features

- **Full multi-tenant RLS** using `get_active_company_id()`
- **Retry-by-ID logic** that updates same row (never duplicates)
- **Dynamic wake schedules** per device with midnight-effective changes
- **Complete audit trails** for all device events
- **Session completeness tracking** (expected vs received)
- **Automated alerting** for missed wakes, failures, low battery

---

## Deployment Options

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of each migration file **in order**:
   - First: `supabase/migrations/20251110000000_create_device_submission_system.sql`
   - Second: `supabase/migrations/20251110000001_device_submission_functions.sql`
   - Third: `supabase/migrations/20251110000002_device_submission_handlers.sql`
5. Click **Run** for each file
6. Verify no errors in the output panel

### Option 2: Supabase CLI

If you have the Supabase CLI installed:

```bash
# Link to your project (if not already linked)
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push

# Or apply specific migrations
supabase migration up
```

### Option 3: Manual SQL Execution

If you prefer a programmatic approach:

```javascript
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const migrations = [
  'supabase/migrations/20251110000000_create_device_submission_system.sql',
  'supabase/migrations/20251110000001_device_submission_functions.sql',
  'supabase/migrations/20251110000002_device_submission_handlers.sql'
];

for (const file of migrations) {
  const sql = readFileSync(file, 'utf-8');
  // Execute using your preferred method
}
```

---

## Verification Steps

After applying migrations, run these verification queries:

### 1. Check Tables Exist

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'site_device_sessions',
    'device_wake_payloads',
    'device_schedule_changes'
  );
```

Expected result: 3 rows

### 2. Check Functions Exist

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE 'fn_%'
ORDER BY routine_name;
```

Expected result: 12 functions starting with `fn_`

### 3. Check RLS Policies

```sql
SELECT tablename, policyname
FROM pg_policies
WHERE tablename IN (
  'site_device_sessions',
  'device_wake_payloads',
  'device_schedule_changes'
);
```

Expected result: At least 5 policies

### 4. Test a Function

```sql
-- Test cron parser
SELECT fn_parse_cron_wake_count('0 8,16 * * *') AS wake_count;
-- Expected: 2

-- Test wake window inference
SELECT *
FROM fn_infer_wake_window_index(
  NOW(),
  '0 8,16 * * *'
);
-- Expected: wake_index and is_overage columns
```

---

## Post-Deployment Configuration

### 1. Set Up pg_cron Jobs

Add these cron jobs to automate session lifecycle:

```sql
-- Midnight session opener (runs at 00:00 UTC)
SELECT cron.schedule(
  'midnight-session-opener',
  '0 0 * * *',
  $$SELECT fn_midnight_session_opener_all()$$
);

-- End of day locker (runs at 23:59 UTC)
SELECT cron.schedule(
  'end-of-day-locker',
  '59 23 * * *',
  $$SELECT fn_end_of_day_locker_all()$$
);
```

**Note**: Adjust times for your site's timezone if needed.

### 2. Update MQTT Edge Function

Your MQTT handler should now call the wake ingestion function:

```javascript
// When device metadata is received
const result = await supabase.rpc('fn_wake_ingestion_handler', {
  p_device_id: deviceId,
  p_captured_at: metadata.capture_timestamp,
  p_image_name: metadata.image_name,
  p_telemetry_data: {
    temperature: metadata.temperature,
    humidity: metadata.humidity,
    pressure: metadata.pressure,
    gas_resistance: metadata.gas_resistance,
    battery_voltage: metadata.battery_voltage,
    wifi_rssi: metadata.wifi_rssi,
    total_chunks: metadata.total_chunks
  }
});

// On image completion
await supabase.rpc('fn_image_completion_handler', {
  p_image_id: imageId,
  p_image_url: storageUrl
});

// On image failure
await supabase.rpc('fn_image_failure_handler', {
  p_image_id: imageId,
  p_error_code: errorCode,
  p_error_message: errorMessage
});
```

---

## Rollback Plan

If you need to rollback these changes:

```sql
-- Drop functions
DROP FUNCTION IF EXISTS fn_midnight_session_opener_all();
DROP FUNCTION IF EXISTS fn_end_of_day_locker_all();
DROP FUNCTION IF EXISTS fn_retry_by_id_handler(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS fn_image_failure_handler(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS fn_image_completion_handler(UUID, TEXT);
DROP FUNCTION IF EXISTS fn_wake_ingestion_handler(UUID, TIMESTAMPTZ, TEXT, JSONB);
DROP FUNCTION IF EXISTS fn_end_of_day_locker(UUID);
DROP FUNCTION IF EXISTS fn_midnight_session_opener(UUID);
DROP FUNCTION IF EXISTS fn_infer_wake_window_index(TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS fn_parse_cron_wake_count(TEXT);

-- Drop tables (CASCADE will drop dependent objects)
DROP TABLE IF EXISTS device_wake_payloads CASCADE;
DROP TABLE IF EXISTS device_schedule_changes CASCADE;
DROP TABLE IF EXISTS site_device_sessions CASCADE;

-- Remove added columns
ALTER TABLE devices DROP COLUMN IF EXISTS x_position;
ALTER TABLE devices DROP COLUMN IF EXISTS y_position;
ALTER TABLE device_images DROP COLUMN IF EXISTS resent_received_at;
ALTER TABLE device_images DROP COLUMN IF EXISTS original_capture_date;
```

---

## Next Steps (Phase 3-6)

Once migrations are applied and verified:

1. **Update MQTT Edge Function** with new handler calls
2. **Build UI Components** for Site Fleet Dashboard
3. **Create API Endpoints** for device session queries
4. **Set up Monitoring** for cron job execution
5. **Test End-to-End** with real device payloads

---

## Troubleshooting

### Error: "relation already exists"

This means tables/functions already exist. Safe to ignore if you're re-running migrations.

### Error: "function get_active_company_id() does not exist"

Your database needs the company context system. Check that migration `20251109170000_create_active_company_context.sql` has been applied.

### Error: "permission denied for schema public"

You need to use the service role key or a user with sufficient privileges.

### Functions not visible to authenticated users

Grant execute permissions:

```sql
GRANT EXECUTE ON FUNCTION fn_wake_ingestion_handler TO authenticated;
-- Repeat for other functions as needed
```

---

## Support

For issues or questions:
1. Check the **CONTEXT.md** document for architecture overview
2. Review the comprehensive plan document (created in this session)
3. Verify all prerequisite migrations are applied
4. Test with sample data before deploying to production

---

**Status**: ✅ Ready for Deployment
**Version**: 1.0
**Date**: 2025-11-10
