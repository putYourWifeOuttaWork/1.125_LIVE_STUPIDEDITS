# Monitor Image Timeouts Edge Function

## Purpose

This edge function monitors image transfers and automatically handles timeouts based on device wake schedules. It implements the session-based retry logic described in the ESP32-CAM architecture documentation.

## How It Works

### 1. **Timeout Detection**
- Runs every 5 minutes (recommended schedule)
- Checks for images with `status='receiving'` that have not completed before `devices.next_wake_at`
- Marks these images as `status='failed'` with appropriate timeout reason

### 2. **Automatic Retry Queueing**
- For each timed-out image, creates a retry command in `device_commands` table
- Command is scheduled to publish 5 minutes BEFORE the device's next wake time
- Device will see the command when it wakes and automatically retry the image transfer

### 3. **Alert Management**
- Tracks retry counts (`retry_count` vs `max_retries`)
- Creates high-priority alerts when images approach max retry limit
- Allows admins to intervene before final failure

### 4. **Command Cleanup**
- Removes expired commands that were never acknowledged
- Keeps command queue clean and performant

## Deployment

### Option 1: Manual Deployment (Supabase CLI)
```bash
supabase functions deploy monitor_image_timeouts
```

### Option 2: Via MCP Tool
Use the `mcp__supabase__deploy_edge_function` tool with this function.

## Scheduling

This function should be called every 5 minutes. There are several ways to schedule it:

### Option 1: pg_cron (Recommended for Supabase)
```sql
SELECT cron.schedule(
  'monitor-image-timeouts',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/monitor_image_timeouts',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) AS request_id;
  $$
);
```

### Option 2: External Cron (cron-job.org, GitHub Actions, etc.)
Schedule a cron job to POST to:
```
https://YOUR_PROJECT.supabase.co/functions/v1/monitor_image_timeouts
```

### Option 3: Supabase Functions Cron (if available)
Configure in your Supabase dashboard.

## Response Format

### Success Response
```json
{
  "success": true,
  "summary": {
    "images_timed_out": 3,
    "retries_queued": 3,
    "failed_to_queue": 0
  },
  "processed_images": [
    "image_20251108_001.jpg",
    "image_20251108_002.jpg",
    "image_20251108_003.jpg"
  ],
  "failed_images": [],
  "timestamp": "2025-11-08T13:45:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Database connection failed",
  "timestamp": "2025-11-08T13:45:00.000Z"
}
```

## Database Functions Used

This edge function calls several PostgreSQL functions:

1. **`timeout_stale_images()`**
   - Marks images as failed if not complete by next_wake_at
   - Returns list of timed-out images

2. **`queue_image_retry(device_id, image_id, image_name)`**
   - Creates retry command in device_commands table
   - Schedules command 5 minutes before next wake
   - Increments retry_count

## Integration with MQTT Handler

The `mqtt_device_handler` edge function checks `device_commands` table when a device connects and publishes pending commands to the device via MQTT.

## Monitoring

Check the edge function logs for:
- Number of images timed out each run
- Retry commands successfully queued
- Any errors in processing

## Testing

### Manual Trigger
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/monitor_image_timeouts \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Test Scenario
1. Create a device with `next_wake_at` in the past
2. Create an image with `status='receiving'` for that device
3. Call the function manually
4. Verify:
   - Image status changed to 'failed'
   - Retry command created in device_commands
   - Device history event created

## Configuration

Environment variables (auto-provided by Supabase):
- `SUPABASE_URL`: Your project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin operations

## Security

- Uses service role key for database operations
- RLS policies ensure users can only see their own device data
- CORS enabled for cross-origin requests

## Architecture Alignment

This function implements Section 6 (Reliability & Retry Mechanism) of the ESP32-CAM Architecture Document:
- Respects wake window scheduling
- Implements chunk-based retry logic
- Maintains device state through sessions
- Provides visibility into retry attempts
