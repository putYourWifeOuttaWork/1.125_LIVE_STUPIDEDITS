# Multi-Channel Alert Notification System - Deployment Guide

## Overview

This comprehensive notification system provides **Email**, **Browser**, and **In-App** notifications for device alerts. It includes user preferences, quiet hours, alert severity filtering, and full tracking/logging.

## Architecture

1. **Database Layer**: User preferences, notification logs, escalation rules
2. **Edge Functions**: Email delivery (Resend) and notification orchestration
3. **Frontend**: Notification center, preferences UI, real-time updates
4. **Auto-Trigger**: Database trigger automatically notifies on new alerts

---

## Step 1: Apply Database Migrations

### 1.1 Foundation Migration

Go to your **Supabase SQL Editor** and run the contents of:

```
/tmp/cc-agent/51386994/project/notification_system_foundation.sql
```

This creates:
- `user_notification_preferences` table
- `notification_delivery_log` table
- `alert_escalation_rules` table
- Helper functions (`get_user_notification_preferences`, `should_send_notification`, etc.)
- RLS policies for all tables

### 1.2 Auto-Trigger Migration

Run the contents of:

```
/tmp/cc-agent/51386994/project/auto_notify_alerts_trigger.sql
```

This creates:
- Trigger function that automatically calls the notification system when alerts are created
- Manual notification function for testing: `manually_notify_alert(alert_id)`

---

## Step 2: Configure Resend.com for Email Notifications

### 2.1 Sign Up for Resend

1. Go to [resend.com](https://resend.com)
2. Create an account (free tier includes 3,000 emails/month)
3. Verify your email address

### 2.2 Get Your API Key

1. In Resend Dashboard, go to **API Keys**
2. Click "Create API Key"
3. Give it a name like "GRMTek Alerts"
4. **Copy the API key** (it will only be shown once!)

### 2.3 Configure Sending Domain (Optional but Recommended)

**Option A: Use Resend's Test Domain**
- You can send from `onboarding@resend.dev` immediately
- Limited to your verified email addresses only

**Option B: Configure Your Own Domain**
1. Go to **Domains** in Resend Dashboard
2. Add your domain (e.g., `grmtek.com`)
3. Add the DNS records Resend provides to your domain registrar
4. Wait for verification (usually instant)
5. Set "From" address in the Edge Function code (line 69):
   ```typescript
   from: 'GRMTek Alerts <alerts@grmtek.com>',
   ```

---

## Step 3: Deploy Edge Functions

### 3.1 Set Environment Variable

In your **Supabase Dashboard**:

1. Go to **Project Settings** → **Edge Functions** → **Environment Variables**
2. Add a new variable:
   - **Name**: `RESEND_API_KEY`
   - **Value**: Your Resend API key from Step 2.2

### 3.2 Deploy Email Notification Function

```bash
npx supabase functions deploy send_email_notification --no-verify-jwt
```

### 3.3 Deploy Notification Orchestrator Function

```bash
npx supabase functions deploy notify_alert --no-verify-jwt
```

### 3.4 Verify Deployment

Check that both functions appear in **Supabase Dashboard** → **Edge Functions**

---

## Step 4: Enable pg_net Extension (For Auto-Triggers)

The auto-trigger uses `pg_net.http_post` to call Edge Functions asynchronously.

1. Go to **Supabase Dashboard** → **Database** → **Extensions**
2. Search for `pg_net`
3. Click **Enable**

### 4.1 Configure Environment Settings

Run in SQL Editor:

```sql
-- Set Supabase URL for pg_net calls
ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';

-- Set service role key (NEVER commit this to git!)
ALTER DATABASE postgres SET app.supabase_service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

Replace:
- `YOUR_PROJECT_REF` with your actual Supabase project reference
- `YOUR_SERVICE_ROLE_KEY` with your service role key from **Project Settings** → **API**

---

## Step 5: Test the System

### 5.1 Manual Test (Recommended First)

Create a test alert and manually trigger notification:

```sql
-- Insert a test alert
INSERT INTO device_alerts (
  device_id,
  alert_type,
  severity,
  message,
  current_value,
  threshold_value,
  detected_at
) VALUES (
  'YOUR_DEVICE_ID',
  'Temperature High',
  'critical',
  'Device temperature exceeded safe threshold',
  95.5,
  80.0,
  NOW()
) RETURNING id;

-- Manually trigger notification for the alert
SELECT manually_notify_alert('ALERT_ID_FROM_ABOVE');
```

Check:
1. Email should arrive at your configured address
2. Browser notification should appear (if enabled)
3. In-app notification should show in notification center

### 5.2 Verify Notification Logs

```sql
SELECT * FROM notification_delivery_log
ORDER BY created_at DESC
LIMIT 10;
```

You should see entries with:
- `status = 'sent'` for successful deliveries
- `external_id` populated for emails (Resend message ID)

### 5.3 Test Automatic Triggers

With the trigger enabled, any new unacknowledged alert will automatically send notifications:

```sql
-- This will automatically trigger notifications
INSERT INTO device_alerts (
  device_id,
  alert_type,
  severity,
  message,
  detected_at,
  is_acknowledged
) VALUES (
  'YOUR_DEVICE_ID',
  'Low Battery',
  'high',
  'Device battery is critically low',
  NOW(),
  false  -- Unacknowledged alerts trigger notifications
);
```

---

## Step 6: Configure User Preferences

### 6.1 Access Notification Settings

Users can configure their notification preferences at:

```
/notifications
```

Or via the notification center dropdown → "View all notifications" link

### 6.2 Available Settings

**Channels:**
- Email notifications (with optional address override)
- Browser notifications (requires permission)
- SMS notifications (coming soon)

**Alert Types:**
- Critical, High, Medium, Low severity filtering

**Quiet Hours:**
- Pause non-critical alerts during specific hours
- Timezone-aware

**Advanced:**
- Minimum notification interval (rate limiting)
- Digest mode (future feature)

---

## Step 7: Browser Notification Permission

Users need to grant browser notification permission:

1. Click the bell icon in the header
2. Browser will prompt for notification permission
3. Click "Allow"

Alternatively, users can enable in Notification Settings page:
- Toggle "Browser Notifications"
- Browser will auto-prompt for permission

---

## Frontend Components Added

### Components Created

1. **`NotificationCenter`** (`src/components/notifications/NotificationCenter.tsx`)
   - Bell icon with unread badge
   - Dropdown showing recent notifications
   - Real-time updates via Supabase Realtime
   - Click to mark as read
   - Navigate to device on click

2. **`useNotifications` Hook** (`src/hooks/useNotifications.ts`)
   - Fetches user notifications
   - Subscribes to real-time updates
   - Manages read/unread state
   - Handles browser notification API
   - Automatic toast notifications for in-app alerts

3. **`NotificationSettingsPage`** (`src/pages/NotificationSettingsPage.tsx`)
   - Full UI for managing notification preferences
   - Toggle channels (email, browser, SMS)
   - Configure quiet hours
   - Set alert severity filters
   - Advanced rate limiting settings

### Integration

The `NotificationCenter` is integrated into `AppLayout` header (line 276), appearing next to Sessions button.

---

## Database Schema Reference

### user_notification_preferences

```sql
user_id uuid (FK to auth.users)
company_id uuid (FK to companies)
email_enabled boolean DEFAULT true
email_address text (optional override)
browser_enabled boolean DEFAULT true
push_subscription jsonb (Web Push subscription)
sms_enabled boolean DEFAULT false
phone_number text
alert_types jsonb DEFAULT '["critical", "high", "medium"]'
quiet_hours_enabled boolean DEFAULT false
quiet_hours_start time
quiet_hours_end time
quiet_hours_timezone text DEFAULT 'UTC'
digest_mode boolean DEFAULT false
digest_frequency text DEFAULT 'hourly'
min_notification_interval interval DEFAULT '5 minutes'
```

### notification_delivery_log

```sql
alert_id uuid (FK to device_alerts, nullable)
user_id uuid (FK to auth.users)
company_id uuid (FK to companies)
channel text ('email', 'browser', 'sms', 'in_app')
status text ('pending', 'sent', 'failed', 'bounced', 'delivered', 'read')
subject text
message text
metadata jsonb (device info, severity, values)
sent_at timestamptz
delivered_at timestamptz
read_at timestamptz
failed_at timestamptz
error_message text
external_id text (Resend message ID, etc.)
```

### alert_escalation_rules

```sql
company_id uuid (FK to companies)
name text
description text
alert_severity text[] DEFAULT ARRAY['critical', 'high']
trigger_after interval DEFAULT '15 minutes'
escalation_channels jsonb DEFAULT '["email", "browser", "sms"]'
notify_roles text[] DEFAULT ARRAY['company_admin']
notify_user_ids uuid[]
active boolean DEFAULT true
```

---

## Monitoring and Troubleshooting

### Check Notification Delivery

```sql
-- See all notifications sent in last 24 hours
SELECT
  u.email,
  n.channel,
  n.status,
  n.subject,
  n.created_at,
  n.error_message
FROM notification_delivery_log n
JOIN auth.users u ON u.id = n.user_id
WHERE n.created_at > NOW() - INTERVAL '24 hours'
ORDER BY n.created_at DESC;
```

### Check Failed Notifications

```sql
SELECT *
FROM notification_delivery_log
WHERE status = 'failed'
ORDER BY created_at DESC;
```

### Edge Function Logs

Go to **Supabase Dashboard** → **Edge Functions** → Select function → **Logs**

Common issues:
- `RESEND_API_KEY not configured` - Missing environment variable
- `Failed to fetch alert` - Alert ID doesn't exist or RLS blocking
- `Failed to send email` - Check Resend dashboard for delivery errors

### Verify User Preferences

```sql
SELECT
  u.email,
  unp.*
FROM user_notification_preferences unp
JOIN auth.users u ON u.id = unp.user_id;
```

---

## Performance Considerations

### Notification Rate Limiting

The system includes built-in rate limiting:

1. **Per-user min_notification_interval** (default 5 minutes)
   - Prevents notification spam from rapid-fire alerts
   - Configurable per user in preferences

2. **Quiet Hours**
   - Non-critical alerts paused during user-defined hours
   - Critical alerts always sent

3. **Alert Severity Filtering**
   - Users only receive alerts for severities they've enabled

### Database Indexes

All necessary indexes are created in the foundation migration:

- `notification_delivery_log(alert_id)`
- `notification_delivery_log(user_id)`
- `notification_delivery_log(company_id)`
- `notification_delivery_log(status)`
- `notification_delivery_log(created_at DESC)`
- `device_alerts(notification_sent_at)`
- `device_alerts(last_notified_at)`

---

## Future Enhancements (Commented in Code)

1. **SMS Notifications via Twilio**
   - UI prepared but functionality commented out
   - Add `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` env vars
   - Uncomment SMS logic in `notify_alert/index.ts`

2. **Web Push Notifications**
   - Push subscription storage ready (`push_subscription` column)
   - Requires VAPID keys and service worker implementation

3. **Digest Mode**
   - Bundle non-critical alerts into periodic summaries
   - Database fields ready, needs scheduling implementation

4. **Escalation Rules**
   - Auto-escalate unacknowledged alerts after time threshold
   - Table ready, needs scheduler integration

---

## Security Notes

1. **RLS Policies**
   - Users can only view/edit their own preferences
   - Users can only view their own notification logs
   - Company admins can view company-wide logs
   - Edge functions use service role to bypass RLS

2. **API Keys**
   - Never commit `RESEND_API_KEY` to git
   - Store as Supabase environment variable only
   - Rotate keys periodically

3. **Email Security**
   - Resend handles DKIM/SPF automatically
   - No user-provided email content (prevents injection)
   - All emails use predefined templates

---

## Build and Deploy Frontend

Run build to ensure everything compiles:

```bash
npm run build
```

If you see any errors related to notifications, check that all imports are correct.

---

## Summary

You now have a fully-functional multi-channel notification system with:

- **Email** notifications via Resend (beautiful HTML templates)
- **Browser** notifications with desktop alerts
- **In-App** notification center with real-time updates
- **User preferences** for complete control over alerts
- **Quiet hours** and rate limiting
- **Full audit trail** in notification_delivery_log
- **Automatic triggering** on new device alerts

The system is production-ready and scales with your user base!

---

## Quick Start Checklist

- [ ] Apply `notification_system_foundation.sql` in Supabase SQL Editor
- [ ] Apply `auto_notify_alerts_trigger.sql` in Supabase SQL Editor
- [ ] Sign up for Resend.com and get API key
- [ ] Add `RESEND_API_KEY` to Supabase environment variables
- [ ] Deploy `send_email_notification` Edge Function
- [ ] Deploy `notify_alert` Edge Function
- [ ] Enable `pg_net` extension in Supabase
- [ ] Configure `app.supabase_url` and `app.supabase_service_role_key`
- [ ] Test with manual alert insertion
- [ ] Verify notifications arrive via email and browser
- [ ] Configure user preferences at `/notifications`
- [ ] Run `npm run build` to verify frontend compilation

---

## Support

If you encounter issues:

1. Check Edge Function logs in Supabase Dashboard
2. Check notification_delivery_log for failed deliveries
3. Verify all environment variables are set correctly
4. Ensure pg_net extension is enabled
5. Check browser console for frontend errors

**The system is designed to fail gracefully** - if notifications fail, alert creation still succeeds.
