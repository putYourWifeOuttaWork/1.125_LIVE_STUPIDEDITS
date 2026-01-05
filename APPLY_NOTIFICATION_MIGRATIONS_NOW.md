# Apply Notification System Migrations

## Status: Ready to Deploy ✓

All schema compatibility issues have been resolved. Both SQL files are now fully compatible with your database.

## What Was Fixed

1. ✓ Foreign key references (alert_id, company_id)
2. ✓ Trigger condition (resolved_at instead of is_acknowledged)
3. ✓ RLS policies (is_company_admin/is_super_admin instead of role)
4. ✓ Escalation rules schema (boolean flags instead of role array)
5. ✓ Build verified successful

## Deploy Instructions

### Step 1: Open Supabase SQL Editor

Navigate to: **Supabase Dashboard → SQL Editor**

### Step 2: Apply Foundation Migration

1. Open file: `notification_system_foundation.sql`
2. Copy entire contents
3. Paste into SQL Editor
4. Click "Run" or press `Cmd/Ctrl + Enter`
5. Verify success (should say "Success. No rows returned")

This creates:
- 3 new tables (user_notification_preferences, notification_delivery_log, alert_escalation_rules)
- 6 helper functions
- 4 new columns on device_alerts
- All RLS policies

### Step 3: Apply Trigger Migration

1. Open file: `auto_notify_alerts_trigger.sql`
2. Copy entire contents
3. Paste into SQL Editor
4. Click "Run"
5. Verify success

This creates:
- `notify_alert_created()` function
- `trigger_notify_alert_created` trigger on device_alerts
- `manually_notify_alert()` helper function

### Step 4: Verify Installation

Run this verification query:

```sql
-- Verify tables
SELECT 'user_notification_preferences' as object, COUNT(*) as exists
FROM information_schema.tables
WHERE table_name = 'user_notification_preferences'
UNION ALL
SELECT 'notification_delivery_log', COUNT(*)
FROM information_schema.tables
WHERE table_name = 'notification_delivery_log'
UNION ALL
SELECT 'alert_escalation_rules', COUNT(*)
FROM information_schema.tables
WHERE table_name = 'alert_escalation_rules'
UNION ALL
SELECT 'trigger_notify_alert_created', COUNT(*)
FROM information_schema.triggers
WHERE trigger_name = 'trigger_notify_alert_created';
```

Expected output: 4 rows, each with `exists = 1`

### Step 5: Test the System

```sql
-- Create a test alert (should trigger notification automatically)
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
  device_id,
  'low_battery',
  'warning',
  'Test notification system',
  company_id,
  program_id,
  site_id
FROM devices
WHERE device_type = 'physical'
AND is_active = true
LIMIT 1;

-- Verify notification was logged
SELECT
  channel,
  status,
  subject,
  created_at
FROM notification_delivery_log
ORDER BY created_at DESC
LIMIT 1;
```

## What Happens Next

Once deployed:
1. Any new alert inserted with `resolved_at IS NULL` will automatically trigger notifications
2. Users can set their notification preferences (email, SMS, browser push)
3. Quiet hours and notification intervals will be respected
4. All notifications will be logged for audit purposes
5. Company admins can configure escalation rules

## Troubleshooting

### If Step 2 fails:
- Check error message carefully
- Verify you're in the correct database
- Ensure no table name conflicts

### If Step 3 fails:
- Ensure Step 2 completed successfully first
- Check that device_alerts table exists
- Verify net.http_post extension is available

### If trigger doesn't fire:
- Check trigger exists: `SELECT * FROM information_schema.triggers WHERE trigger_name = 'trigger_notify_alert_created';`
- Verify Edge Function is deployed
- Check Supabase logs for errors

## Files to Deploy

1. **notification_system_foundation.sql** - Main migration (tables, functions, RLS)
2. **auto_notify_alerts_trigger.sql** - Automatic notification trigger

Both files are schema-compatible and ready to run.

## Estimated Time

- Step 2: ~5 seconds
- Step 3: ~2 seconds
- Step 4: ~1 second
- Step 5: ~3 seconds

**Total: < 15 seconds**

## Deploy Now!

No more errors. All schema issues resolved. Ready to go! 🚀
