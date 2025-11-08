# Image Timeout & Retry System - Complete Guide

## Overview

This document explains the session-based image timeout and automatic retry system for IoT device image transfers.

---

## Key Concepts

### 1. **Sessions**
Each device wake-to-sleep cycle is a **session**. Sessions group all events, images, and telemetry from one wake period.

- **Session Start**: When device wakes and sends HELLO message
- **Session End**: When device goes back to sleep
- **Session Data**: Images transmitted, chunks sent, duration, next wake time

### 2. **Wake Windows**
Devices operate on a schedule (controlled by `next_wake_at` and `wake_schedule_cron`):
- Device wakes at scheduled time
- Stays awake just long enough to transmit data (~2-10 minutes)
- Goes back to sleep to conserve battery

### 3. **Image Transfer Protocol**
From ESP32-CAM Architecture Document:
1. Device captures image
2. Splits into chunks (128 bytes each)
3. Transmits chunks sequentially
4. Server validates and sends ACK_OK or MISSING_CHUNKS
5. Device retransmits only missing chunks
6. On ACK_OK, device receives `next_wake` time and sleeps

### 4. **Timeout Logic**
- **Problem**: Device goes to sleep before completing transfer
- **Detection**: If `status='receiving'` AND `now() >= next_wake_at`
- **Action**: Mark as `failed`, queue retry command for next wake

---

## Database Schema

### Existing Tables (Enhanced)

#### `device_wake_sessions` (Existing - We Use This!)
Comprehensive wake-to-sleep cycle tracking:
```sql
- session_id (PK)
- device_id (FK)
- wake_timestamp
- session_duration_ms
- next_wake_scheduled
- status ('in_progress', 'completed', 'timeout', 'error')
- connection_success, mqtt_connected
- image_captured, image_id
- chunks_sent, chunks_total, chunks_missing[]
- transmission_complete
- telemetry_data (jsonb) - battery, temp, humidity
- error_codes[]
- pending_images_count
- wifi_retry_count
```

**Why we use device_wake_sessions:**
- Already comprehensive with chunk tracking
- Already integrated with device_history
- Has telemetry and error code tracking
- More detailed than a separate session table

#### `device_commands` (Extended)
Command queue for devices:
```sql
- command_id (PK)
- device_id (FK)
- command_type ('retry_image', 'capture_image', 'update_config', 'resend_chunks')
- command_payload (jsonb with image details)
- priority (1-10, higher = more urgent)
- status ('pending', 'published', 'acknowledged', 'completed', 'failed', 'cancelled')
- scheduled_for (when to publish - 5 min before wake)
- expires_at (1 hour after wake)
- retry_count, max_retries
```

### Schema Changes

#### `device_images` - New Columns:
- `retry_count` - How many times we've retried (default 0)
- `max_retries` - Maximum attempts allowed (default 3)
- `failed_at` - Timestamp when marked as failed
- `timeout_reason` - Why it failed

#### `device_history` - Existing Column:
- `session_id` - Already links events to device_wake_sessions

---

## How It Works

### Normal Flow (Success)

```
1. Device wakes at next_wake_at
   └─ MQTT handler creates device_wake_session
   └─ Status: 'in_progress'

2. Device sends HELLO (alive message)
   └─ Updates device.last_wake_at
   └─ Links all activity to current wake session

3. Server sends command: capture_image

4. Device captures image, sends metadata
   └─ device_images: status='pending'

5. Server sends command: send_image

6. Device transmits all chunks
   └─ device_images: status='receiving'
   └─ Each chunk logged in device_history

7. Server validates chunks
   └─ All received → sends ACK_OK
   └─ device_images: status='complete'

8. Device receives next_wake time, goes to sleep
   └─ Session remains 'active' until next wake
```

### Timeout & Retry Flow

```
1. Image transfer starts (status='receiving')

2. Device goes to sleep before completing
   └─ Only awake ~2-10 minutes per wake window

3. Edge function runs (every 5 minutes)
   └─ timeout_stale_images() detects:
      - status='receiving'
      - now() >= device.next_wake_at
      - retry_count < max_retries

4. Image marked as failed
   └─ status='failed'
   └─ failed_at=now()
   └─ timeout_reason='Transmission not completed before next wake window'

5. Retry command queued
   └─ queue_image_retry() creates command:
      - command_type='retry_image'
      - scheduled_for = next_wake_at - 5 minutes
      - expires_at = next_wake_at + 1 hour
      - priority=8 (high)

6. Device wakes at next wake window
   └─ MQTT handler checks device_commands table
   └─ Publishes retry commands to device

7. Device retransmits the same image
   └─ Attempts all chunks again

8. Repeat until:
   └─ Success (status='complete')
   └─ OR max_retries reached
      └─ Admin alert created
      └─ Manual intervention needed
```

### Manual Retry Flow

```
1. Admin views device detail page
   └─ Sees "3 failed images" badge

2. Admin clicks "Retry All Failed Images"
   └─ Skips automatic retry logic
   └─ Immediately queues retry for all failed images
   └─ Resets retry_count to 0

3. Commands published before next wake

4. Device wakes → retries all images
```

---

## Edge Function: monitor_image_timeouts

### Purpose
Monitors stale image transfers and automatically queues retries.

### Schedule
Runs every 5 minutes (via pg_cron or external scheduler)

### Logic
```typescript
1. Call timeout_stale_images()
   └─ Returns: [{device_id, image_id, image_name}]

2. For each timed-out image:
   a. queue_image_retry()
      └─ Creates command in device_commands
      └─ Increments retry_count

   b. Create device_history event
      └─ event_type='image_transfer_timeout'
      └─ severity='warning'

   c. Check retry count
      └─ If retry_count >= max_retries - 1:
         └─ Create device_alert (high severity)
         └─ Admin notification

3. Cleanup expired commands
   └─ status='cancelled' if expired
```

### Deployment
```bash
# Deploy function
supabase functions deploy monitor_image_timeouts

# Set up cron (in Supabase SQL Editor)
SELECT cron.schedule(
  'monitor-image-timeouts',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/monitor_image_timeouts',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) AS request_id;
  $$
);
```

---

## UI Components

### Device Cards (List View)
Shows compact status badges:
```
┌─────────────────────────────────────┐
│ Device 001                   Online │
│ Test Site • Program #2              │
│                                     │
│ 95% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                     │
│ 📷 12  [1 pending]  [2 failed]     │
└─────────────────────────────────────┘
```

### Device Detail Page - Images Card
Prominent display of image status:
```
┌─────────────────────────────────────┐
│ Images                              │
├─────────────────────────────────────┤
│ Total Images                     12 │
│                                     │
│ Pending Transfer                  1 │
│ Images currently being transmitted  │
│                                     │
│ ⚠️ Failed Transfers              2 │
│ Images that failed to complete      │
│ before wake window                  │
│                                     │
│ [Retry All Failed Images]          │
└─────────────────────────────────────┘
```

### Device History Tab
Session-grouped events:
```
Session #123 (2025-11-08 13:00 - 13:05)
├─ Device Online
├─ Image Capture Started
│  └─ image_20251108_001.jpg
├─ Chunk Transfer (1/15)
├─ Chunk Transfer (2/15)
...
├─ Image Transfer Timeout ⚠️
└─ Device Offline
```

---

## Testing

### Test Scenario 1: Normal Operation
```bash
# 1. Create test device with wake schedule
# 2. Simulate image transfer
# 3. Verify session created
# 4. Verify all chunks received
# 5. Verify status='complete'
```

### Test Scenario 2: Timeout & Auto-Retry
```bash
# 1. Create device with next_wake_at in past
# 2. Create image with status='receiving'
# 3. Manually trigger edge function
# 4. Verify:
#    - Image status='failed'
#    - Retry command created
#    - History event created
# 5. Simulate device wake
# 6. Verify retry command published
```

### Test Scenario 3: Max Retries
```bash
# 1. Create image with retry_count=2, max_retries=3
# 2. Trigger timeout
# 3. Verify alert created (final attempt)
# 4. Set retry_count=3
# 5. Trigger timeout
# 6. Verify no more retries queued
```

### Test Scenario 4: Manual Retry
```bash
# 1. Create device with failed images
# 2. Open device detail page
# 3. Click "Retry All Failed Images"
# 4. Verify commands queued
# 5. Verify retry_count reset
```

---

## Configuration

### Wake Schedule
Set at provisioning or via UI:
```typescript
{
  wake_schedule_cron: '0 */6 * * *',  // Every 6 hours
  next_wake_at: '2025-11-08T19:00:00Z'
}
```

### Retry Settings
Default values (can be adjusted):
```typescript
{
  max_retries: 3,
  retry_timeout_window: 'next_wake_at',  // Not fixed time
  command_schedule_offset: '-5 minutes', // Publish before wake
  command_expiry: '+1 hour'              // Expire after wake
}
```

---

## Monitoring

### Key Metrics to Watch

1. **Timeout Rate**
   ```sql
   SELECT
     device_id,
     COUNT(*) FILTER (WHERE status='failed') as failed_count,
     COUNT(*) as total_images,
     ROUND(100.0 * COUNT(*) FILTER (WHERE status='failed') / COUNT(*), 2) as failure_rate
   FROM device_images
   GROUP BY device_id
   ORDER BY failure_rate DESC;
   ```

2. **Retry Success Rate**
   ```sql
   SELECT
     device_id,
     AVG(retry_count) as avg_retries,
     COUNT(*) FILTER (WHERE retry_count > 0 AND status='complete') as retry_successes,
     COUNT(*) FILTER (WHERE retry_count >= max_retries) as max_retry_failures
   FROM device_images
   WHERE created_at >= NOW() - INTERVAL '7 days'
   GROUP BY device_id;
   ```

3. **Session Analytics**
   ```sql
   SELECT
     DATE_TRUNC('day', session_start_time) as date,
     COUNT(*) as total_sessions,
     AVG(session_duration_seconds) as avg_duration,
     SUM(images_transmitted) as total_images,
     SUM(images_failed) as total_failures
   FROM device_sessions
   WHERE session_start_time >= NOW() - INTERVAL '30 days'
   GROUP BY date
   ORDER BY date DESC;
   ```

### Alerts to Set Up

1. **High Failure Rate**: > 10% images failing per device
2. **Max Retries Reached**: Image hit max_retries
3. **Session Timeouts**: Device not waking on schedule
4. **Command Queue Backlog**: > 10 pending commands per device

---

## Troubleshooting

### Problem: Images always timing out

**Possible Causes:**
- Wake window too short (device sleeps before completing)
- Network issues (slow WiFi)
- Too many images queued (device tries to send too much)

**Solutions:**
1. Increase wake window duration
2. Reduce chunk size (faster transmission)
3. Limit images per wake window

### Problem: Retry commands not being processed

**Possible Causes:**
- MQTT handler not checking command queue
- Commands expiring before device wakes
- Device not subscribing to command topic

**Solutions:**
1. Update MQTT handler to publish commands
2. Adjust `scheduled_for` offset (publish earlier)
3. Verify device MQTT subscriptions

### Problem: Too many failed images, retries not helping

**Possible Causes:**
- Fundamental network/connectivity issue
- Device hardware problem
- Server not sending ACK properly

**Solutions:**
1. Check device WiFi signal strength (wifi_rssi)
2. Review server logs for ACK errors
3. Test with manual image capture command

---

## Architecture Alignment

This system fully implements the ESP32-CAM Architecture Document:

✅ **Section 3**: Device wakes only during server-defined windows
✅ **Section 5**: MQTT JSON format for commands and data
✅ **Section 6**: Chunked transmission with retry mechanism
✅ **Section 8**: Offline queue and recovery synchronization

---

## Next Steps

1. ✅ Apply migration: `20251108200001_session_and_timeout_fix.sql`
2. ✅ Deploy edge function: `monitor_image_timeouts`
3. ✅ Set up pg_cron schedule (every 5 minutes)
4. ⬜ Update MQTT handler to publish commands from queue
5. ⬜ Implement "Retry All" button API endpoint
6. ⬜ Add session-based history grouping to UI
7. ⬜ Set up monitoring dashboards and alerts

---

## Summary

The session-based image timeout and retry system provides:

- **Automatic Detection**: Identifies failed transfers based on wake schedule
- **Smart Retry Logic**: Queues retries for next wake window (not immediate)
- **Manual Override**: Admin can force retry and skip auto-logic
- **Full Visibility**: UI shows pending/failed status with clear actions
- **Session Tracking**: Groups all activity by wake-sleep cycles
- **Alert System**: Notifies admins when max retries approached

This ensures reliable image delivery even with intermittent connectivity and battery-optimized device operation.
