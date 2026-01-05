# Notification System - Fixes Applied

## Summary

Fixed SQL schema compatibility issues in the notification system migrations to match your existing `device_alerts` table structure.

## Changes Made

### 1. notification_system_foundation.sql

**Fixed Foreign Key References:**
- Line 39: `companies(id)` → `companies(company_id)` ✓
- Line 79: `device_alerts(id)` → `device_alerts(alert_id)` ✓
- Line 81: `companies(id)` → `companies(company_id)` ✓
- Line 112: `companies(id)` → `companies(company_id)` ✓

### 2. auto_notify_alerts_trigger.sql

**Fixed Column References:**
- Line 25: `NEW.id` → `NEW.alert_id` ✓
- Line 33: `NEW.id` → `NEW.alert_id` ✓
- Line 44: `NEW.is_acknowledged = false` → `NEW.resolved_at IS NULL` ✓

## What Was Wrong

Your existing schema uses:
- `device_alerts.alert_id` as primary key (not `id`)
- `device_alerts.resolved_at` to track resolution (not `is_acknowledged`)
- `companies.company_id` as primary key (not `id`)

The original SQL files referenced non-existent columns, causing foreign key constraint errors.

## Next Steps

### Apply the Corrected Migrations

1. **Open Supabase SQL Editor**

2. **Run Foundation Migration:**
   - Copy and paste the entire contents of `notification_system_foundation.sql`
   - Execute the query
   - Verify success

3. **Run Trigger Migration:**
   - Copy and paste the entire contents of `auto_notify_alerts_trigger.sql`
   - Execute the query
   - Verify success

### Verify Installation

Run this query to verify the tables were created:

```sql
-- Check new tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'user_notification_preferences',
  'notification_delivery_log',
  'alert_escalation_rules'
);

-- Check device_alerts columns added
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'device_alerts'
AND column_name IN (
  'notification_sent_at',
  'notification_channels',
  'last_notified_at',
  'notification_count'
);

-- Check trigger exists
SELECT trigger_name
FROM information_schema.triggers
WHERE trigger_name = 'trigger_notify_alert_created';
```

### Test the System

```sql
-- Insert a test alert (should trigger notification)
INSERT INTO device_alerts (
  device_id,
  alert_type,
  severity,
  message,
  company_id,
  program_id,
  site_id
) VALUES (
  (SELECT device_id FROM devices LIMIT 1),
  'low_battery',
  'warning',
  'Test alert for notification system',
  (SELECT company_id FROM companies LIMIT 1),
  (SELECT program_id FROM pilot_programs LIMIT 1),
  (SELECT site_id FROM sites LIMIT 1)
);

-- Check if notification was logged
SELECT * FROM notification_delivery_log
ORDER BY created_at DESC
LIMIT 5;
```

## System Overview

### Tables Created

1. **user_notification_preferences** - Per-user notification settings
2. **notification_delivery_log** - Audit trail of all notifications sent
3. **alert_escalation_rules** - Company-level escalation policies

### Columns Added to device_alerts

- `notification_sent_at` - When first notification was sent
- `notification_channels` - JSON array of channels used
- `last_notified_at` - Most recent notification timestamp
- `notification_count` - Number of times notified

### Functions Created

- `get_user_notification_preferences()` - Get user notification settings
- `should_send_notification()` - Check if notification should be sent
- `log_notification()` - Record notification attempt
- `update_notification_status()` - Update notification delivery status
- `notify_alert_created()` - Trigger function for new alerts
- `manually_notify_alert()` - Manual testing function

### Trigger Created

- `trigger_notify_alert_created` - Automatically fires on new unresolved alerts

## Security

All tables have RLS enabled:
- Users can view/edit their own preferences
- Users can view their own notification logs
- Company admins can view all company notifications
- Company admins can manage escalation rules

## Ready for Deployment

The corrected SQL files are now compatible with your schema and ready to apply!
