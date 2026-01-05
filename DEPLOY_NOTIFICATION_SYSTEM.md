# Deploy Notification System - Complete Guide

## Overview

This guide walks you through deploying the complete notification system for device alerts. The system automatically sends notifications when alerts are created and provides user-configurable preferences.

## Prerequisites

- Access to Supabase SQL Editor
- Access to Supabase Edge Functions
- Environment variables configured

## Deployment Steps

### Step 1: Apply Foundation Migration

1. Open Supabase SQL Editor
2. Copy the entire contents of `notification_system_foundation.sql`
3. Paste and execute
4. Verify success (should see "Success. No rows returned")

This creates:
- `user_notification_preferences` table
- `notification_delivery_log` table
- `alert_escalation_rules` table
- Helper functions
- RLS policies

### Step 2: Apply Auto-Notification Trigger

1. Still in SQL Editor
2. Copy the entire contents of `auto_notify_alerts_trigger.sql`
3. Paste and execute
4. Verify success

This creates:
- `notify_alert_created()` trigger function
- `trigger_notify_alert_created` trigger on device_alerts
- `manually_notify_alert()` helper function

### Step 3: Verify Database Changes

Run this verification query:

```sql
-- Check all tables exist
SELECT
  'user_notification_preferences' as table_name,
  COUNT(*) as exists
FROM information_schema.tables
WHERE table_name = 'user_notification_preferences'
UNION ALL
SELECT 'notification_delivery_log', COUNT(*)
FROM information_schema.tables
WHERE table_name = 'notification_delivery_log'
UNION ALL
SELECT 'alert_escalation_rules', COUNT(*)
FROM information_schema.tables
WHERE table_name = 'alert_escalation_rules';

-- Check device_alerts columns added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'device_alerts'
AND column_name IN (
  'notification_sent_at',
  'notification_channels',
  'last_notified_at',
  'notification_count'
);

-- Check trigger is active
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trigger_notify_alert_created';

-- Check functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN (
  'get_user_notification_preferences',
  'should_send_notification',
  'log_notification',
  'update_notification_status',
  'notify_alert_created',
  'manually_notify_alert'
)
ORDER BY routine_name;
```

Expected results:
- 3 tables with count = 1
- 4 new device_alerts columns
- 1 trigger
- 6 functions

### Step 4: Edge Function Deployment

The notification system requires the Edge Function from `NOTIFICATION_SYSTEM_DEPLOYMENT_GUIDE.md`.

**Note:** The Edge Function should already be deployed. If not:

1. Review `supabase/functions/notify_alert/index.ts`
2. Deploy using Supabase CLI or dashboard
3. Configure environment variables

### Step 5: Test the System

#### Test 1: Create a Test Alert

```sql
-- Create a test low battery alert
INSERT INTO device_alerts (
  device_id,
  alert_type,
  severity,
  message,
  company_id,
  program_id,
  site_id
)
SELECT
  d.device_id,
  'low_battery',
  'warning',
  'Test notification: Device battery at 15%',
  d.company_id,
  d.program_id,
  d.site_id
FROM devices d
WHERE d.device_type = 'physical'
LIMIT 1;
```

#### Test 2: Verify Notification Logged

```sql
-- Check notification was logged
SELECT
  ndl.id,
  ndl.channel,
  ndl.status,
  ndl.subject,
  ndl.created_at,
  da.message as alert_message,
  da.severity
FROM notification_delivery_log ndl
JOIN device_alerts da ON da.alert_id = ndl.alert_id
ORDER BY ndl.created_at DESC
LIMIT 5;
```

#### Test 3: Check User Preferences

```sql
-- Get your notification preferences
SELECT * FROM get_user_notification_preferences(
  auth.uid(),
  (SELECT company_id FROM users WHERE id = auth.uid())
);
```

#### Test 4: Manual Notification Test

```sql
-- Manually trigger notification for an alert
SELECT manually_notify_alert(
  (SELECT alert_id FROM device_alerts WHERE resolved_at IS NULL LIMIT 1)
);
```

### Step 6: Configure User Preferences (Optional)

Users can configure their preferences via the UI (to be built) or directly:

```sql
-- Set your notification preferences
INSERT INTO user_notification_preferences (
  user_id,
  company_id,
  email_enabled,
  email_address,
  browser_enabled,
  sms_enabled,
  phone_number,
  alert_types,
  quiet_hours_enabled,
  quiet_hours_start,
  quiet_hours_end,
  quiet_hours_timezone,
  min_notification_interval
) VALUES (
  auth.uid(),
  (SELECT company_id FROM users WHERE id = auth.uid()),
  true,
  (SELECT email FROM auth.users WHERE id = auth.uid()),
  true,
  false,
  NULL,
  '["critical", "high", "medium"]'::jsonb,
  true,
  '22:00:00'::time,  -- 10 PM
  '07:00:00'::time,  -- 7 AM
  'America/New_York',
  '5 minutes'::interval
)
ON CONFLICT (user_id, company_id)
DO UPDATE SET
  email_enabled = EXCLUDED.email_enabled,
  browser_enabled = EXCLUDED.browser_enabled,
  quiet_hours_enabled = EXCLUDED.quiet_hours_enabled,
  quiet_hours_start = EXCLUDED.quiet_hours_start,
  quiet_hours_end = EXCLUDED.quiet_hours_end;
```

## System Architecture

### Data Flow

1. **Alert Created** → device_alerts table insert
2. **Trigger Fires** → `trigger_notify_alert_created` runs
3. **Edge Function Called** → via `net.http_post()`
4. **Preferences Checked** → `get_user_notification_preferences()`
5. **Notification Sent** → Email/SMS/Browser push
6. **Delivery Logged** → notification_delivery_log insert
7. **Status Updated** → Success/failure recorded

### Key Functions

- **get_user_notification_preferences()** - Returns user preferences with defaults
- **should_send_notification()** - Checks if notification should be sent (quiet hours, intervals, etc.)
- **log_notification()** - Records notification attempt
- **update_notification_status()** - Updates delivery status
- **notify_alert_created()** - Trigger function that calls Edge Function
- **manually_notify_alert()** - Manual testing function

### RLS Policies

All tables have strict RLS:
- Users can view/edit their own preferences
- Users can view their own notification logs
- Company admins can view all company notifications
- Only service role can insert/update logs

## Monitoring

### Check Recent Notifications

```sql
SELECT
  ndl.created_at,
  ndl.channel,
  ndl.status,
  ndl.subject,
  u.email as recipient,
  da.alert_type,
  da.severity,
  COALESCE(ndl.delivered_at, ndl.failed_at) as final_status_time
FROM notification_delivery_log ndl
JOIN auth.users u ON u.id = ndl.user_id
JOIN device_alerts da ON da.alert_id = ndl.alert_id
ORDER BY ndl.created_at DESC
LIMIT 20;
```

### Check Failed Notifications

```sql
SELECT
  ndl.created_at,
  ndl.channel,
  ndl.error_message,
  u.email as recipient,
  da.message as alert_message
FROM notification_delivery_log ndl
JOIN auth.users u ON u.id = ndl.user_id
JOIN device_alerts da ON da.alert_id = ndl.alert_id
WHERE ndl.status = 'failed'
ORDER BY ndl.created_at DESC
LIMIT 10;
```

### Check Alert Notification Coverage

```sql
-- Alerts without any notifications
SELECT
  da.alert_id,
  da.alert_type,
  da.severity,
  da.triggered_at,
  da.notification_sent
FROM device_alerts da
LEFT JOIN notification_delivery_log ndl ON ndl.alert_id = da.alert_id
WHERE da.resolved_at IS NULL
AND ndl.id IS NULL
ORDER BY da.triggered_at DESC;
```

## Troubleshooting

### Issue: Trigger Not Firing

Check if trigger exists:
```sql
SELECT * FROM information_schema.triggers
WHERE trigger_name = 'trigger_notify_alert_created';
```

If missing, re-run `auto_notify_alerts_trigger.sql`

### Issue: Edge Function Not Called

Check Supabase logs for errors. Common issues:
- `net.http_post` extension not enabled
- Environment variables not set
- Edge Function not deployed

### Issue: No Notifications Received

Check user preferences:
```sql
SELECT * FROM get_user_notification_preferences(
  auth.uid(),
  (SELECT company_id FROM users WHERE id = auth.uid())
);
```

Check if in quiet hours or min interval not met.

### Issue: All Notifications Failing

Check Edge Function logs in Supabase dashboard:
- Functions → notify_alert → Logs

Common issues:
- Email service not configured
- Invalid email addresses
- Rate limits exceeded

## Performance Considerations

### Indexes

All required indexes are created automatically:
- `idx_notification_delivery_log_alert_id`
- `idx_notification_delivery_log_user_id`
- `idx_notification_delivery_log_company_id`
- `idx_notification_delivery_log_status`
- `idx_device_alerts_notification_sent_at`

### Cleanup Old Logs

Consider adding a periodic cleanup job:

```sql
-- Delete old notification logs (older than 90 days)
DELETE FROM notification_delivery_log
WHERE created_at < now() - interval '90 days';
```

## Next Steps

1. Build frontend UI for user notification preferences
2. Add in-app notification center
3. Configure email templates
4. Set up SMS provider (Twilio)
5. Add push notification support
6. Create escalation rules dashboard

## Success Criteria

- [ ] All 3 tables created
- [ ] 4 columns added to device_alerts
- [ ] 6 functions created
- [ ] 1 trigger active
- [ ] Test alert creates notification log entry
- [ ] Edge Function receives and processes alerts
- [ ] No errors in Supabase logs

## Deployment Complete!

Your notification system is now live and will automatically notify users of device alerts based on their preferences.
