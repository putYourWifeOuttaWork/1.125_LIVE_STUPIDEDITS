# IoT Image Timeout & Retry System - COMPLETE ✅

## Status: Ready to Deploy

All code, migrations, and documentation are complete for the session-based image timeout and automatic retry system.

---

## What We Built

### Database Architecture (Using Existing Tables!)

**device_wake_sessions** (Existing - Enhanced)
- Already tracks comprehensive wake-to-sleep cycles
- Has: chunks_sent, chunks_total, chunks_missing[], telemetry_data, error_codes
- Status: in_progress, completed, timeout, error
- **We use this instead of creating duplicate session table!**

**device_images** (Enhanced)
- NEW: retry_count, max_retries, failed_at, timeout_reason
- Tracks retry attempts per image

**device_commands** (Enhanced)
- NEW: priority, scheduled_for, expires_at, max_retries, error_message
- Priority-based command queue for retries

**device_alerts** (Existing)
- Creates alerts when max retries approached
- Schema: alert_type='image_transmission_failed', severity='critical', message, metadata

---

## Migrations Ready to Apply

### Migration 1: Add Retry Features
**File**: `supabase/migrations/20251108200001_session_and_timeout_fix.sql`

```
1. Verifies device_wake_sessions exists
2. Adds retry columns to device_images
3. Extends device_commands with scheduling
4. Creates RLS policies
5. Creates functions:
   - timeout_stale_images()
   - queue_image_retry()
```

### Migration 2: Remove Duplicate Table
**File**: `supabase/migrations/20251108210000_remove_duplicate_device_sessions.sql`

```
1. Drops device_sessions table (was duplicate)
2. Removes related policies/indexes
3. Verifies device_wake_sessions is primary
4. Ensures device_history.session_id references correctly
```

**Apply Order**: Migrations are numbered correctly (200001, then 210000)

---

## Edge Function Ready

**File**: `supabase/functions/monitor_image_timeouts/index.ts`

**Schedule**: Every 5 minutes (cron)

**What it does**:
1. Detects images stuck in 'receiving' past wake window
2. Marks as 'failed' with timeout reason
3. Queues retry command for next wake
4. Creates device_history event
5. Creates alert if approaching max retries
6. Cleans up expired commands

**Deploy**:
```bash
supabase functions deploy monitor_image_timeouts
```

**Set up cron**:
```sql
SELECT cron.schedule(
  'monitor-image-timeouts',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_SUPABASE_URL/functions/v1/monitor_image_timeouts',
    headers := '{"Authorization": "Bearer SERVICE_KEY"}'::jsonb
  ) AS request_id;
  $$
);
```

---

## UI Components Complete

**Device List** (`DevicesPage.tsx`)
- Yellow badge: [1 pending] for receiving images
- Red badge: [2 failed] for failed images

**Device Detail** (`DeviceDetailPage.tsx`)
- Images card with total/pending/failed counts
- Failed images section (prominent red styling)
- "Retry All Failed Images" button
- Confirmation modal

**Project built successfully** ✅

---

## Testing Data Available

**Test Device 002 - Missing Chunks**
- MAC: TEST-ESP32-002
- Status: active
- Current Image: image_1762625082788.jpg
  - Status: receiving (3/4 chunks)
  - Retry count: 0
  - Max retries: 3

**Perfect for testing!**

---

## Next Steps

### 1. Apply Migrations
```bash
# In Supabase dashboard, apply both migrations in order
# OR via CLI:
# supabase db push
```

### 2. View UI
```bash
# Hard refresh browser: Cmd+Shift+R (Mac) or Ctrl+Shift+F5 (Windows)
# Navigate to /devices
# Should see [1 pending] badge on Test Device 002
```

### 3. Test Timeout Flow
```sql
-- Simulate timeout
UPDATE devices
SET next_wake_at = NOW() - INTERVAL '5 minutes'
WHERE device_name = 'Test Device 002 - Missing Chunks';

-- Trigger timeout detection
SELECT * FROM timeout_stale_images();

-- Verify results
SELECT image_name, status, failed_at, retry_count, timeout_reason
FROM device_images
WHERE image_name = 'image_1762625082788.jpg';
-- Expected: status='failed', retry_count=1

-- Check retry command queued
SELECT command_type, priority, scheduled_for, command_payload
FROM device_commands
WHERE device_id = (SELECT device_id FROM devices WHERE device_name = 'Test Device 002 - Missing Chunks')
ORDER BY created_at DESC LIMIT 1;
-- Expected: command_type='retry_image', priority=8
```

### 4. Test UI
```bash
# Refresh browser
# Navigate to device detail page
# Should see [1 failed] red badge
# Failed images section should be visible
# Click "Retry All Failed Images"
# Confirm in modal
# Check database for new command
```

### 5. Deploy Edge Function
```bash
# Deploy
supabase functions deploy monitor_image_timeouts

# Test manually
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/monitor_image_timeouts' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'

# Expected response:
# {
#   "success": true,
#   "summary": {
#     "images_timed_out": N,
#     "retries_queued": N,
#     "failed_to_queue": 0
#   },
#   "processed_images": [...],
#   "timestamp": "..."
# }

# Then set up cron schedule (see above)
```

---

## How It Works

### The Complete Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Device Wake Cycle                                        │
├─────────────────────────────────────────────────────────────┤
│ Device wakes at scheduled time (next_wake_at)              │
│ └─ MQTT handler creates device_wake_session (in_progress)  │
│ └─ Device sends HELLO message                              │
│ └─ Server checks device_commands for pending commands      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 2. Image Transfer Starts                                    │
├─────────────────────────────────────────────────────────────┤
│ Device captures image                                       │
│ └─ device_images: status='pending'                         │
│ Device starts transmitting chunks                           │
│ └─ device_images: status='receiving', chunks: 1/4         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 3. Device Goes to Sleep (Battery Conservation)             │
├─────────────────────────────────────────────────────────────┤
│ Transfer incomplete, only 3/4 chunks received               │
│ Device sleeps to conserve battery                           │
│ └─ device_wake_session: status='completed'                │
│ └─ next_wake_at updated to next scheduled time            │
│ └─ Image still status='receiving' (stuck)                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 4. Timeout Detection (Edge Function - Every 5 min)         │
├─────────────────────────────────────────────────────────────┤
│ Edge function runs: monitor_image_timeouts                  │
│ └─ Calls timeout_stale_images()                            │
│ └─ Finds: status='receiving' AND now >= next_wake_at      │
│ └─ Marks image as 'failed'                                │
│    • failed_at = now()                                      │
│    • timeout_reason = "Not completed before wake window"   │
│    • retry_count incremented (0 → 1)                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 5. Retry Command Queued                                     │
├─────────────────────────────────────────────────────────────┤
│ Edge function calls queue_image_retry()                     │
│ └─ Creates device_commands entry:                          │
│    • command_type = 'retry_image'                          │
│    • priority = 8 (high)                                    │
│    • scheduled_for = next_wake_at - 5 minutes              │
│    • expires_at = next_wake_at + 1 hour                    │
│    • command_payload = {image_id, image_name, chunks...}   │
│ └─ Creates device_history event                            │
│ └─ If retry_count >= max_retries-1: create alert          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 6. Next Wake - Retry Attempt                                │
├─────────────────────────────────────────────────────────────┤
│ Device wakes at next scheduled time                         │
│ └─ MQTT handler checks device_commands                     │
│ └─ Finds pending retry command                             │
│ └─ Publishes to device: /device/{mac}/commands/retry      │
│ └─ Device receives command with image details              │
│ └─ Device retransmits image (all chunks or missing only)   │
│ └─ On success: status='complete'                          │
│ └─ On failure: repeats timeout flow (up to max_retries)   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 7. Admin Visibility (UI)                                    │
├─────────────────────────────────────────────────────────────┤
│ Device list shows badges:                                   │
│ • [1 pending] (yellow) - currently receiving               │
│ • [2 failed] (red) - retry attempts exhausted              │
│                                                             │
│ Device detail page shows:                                   │
│ • Images card: counts and status                           │
│ • Failed images section: retry count, timeout reason       │
│ • "Retry All Failed Images" button                         │
│ • Manual retry resets counter to 0                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### ✅ Wake Schedule Based Timeouts
- NOT arbitrary 30 minutes
- Based on device's actual next_wake_at
- Respects intermittent connectivity pattern
- Smart: waits until device was supposed to wake again

### ✅ Use device_wake_sessions (Not New Table)
- Already comprehensive with chunk tracking
- Has telemetry, error codes, wifi retries
- Already integrated with device_history
- Avoids duplication and complexity

### ✅ Priority-Based Command Queue
- Retries have priority 8 (high)
- Scheduled 5 min before wake (ready when device connects)
- Auto-expires 1 hour after wake window
- Prevents command backlog

### ✅ Incremental Retry Counter
- max_retries = 3 attempts
- Manual retry from UI resets counter
- Admin alert created on final attempt
- Clear failure tracking and visibility

---

## Documentation

**Complete Guides**:
- `IMAGE_TIMEOUT_AND_RETRY_SYSTEM.md` - Full architecture and flow
- `SESSION_TRACKING_COMPLETE.md` - Testing instructions
- `TIMEOUT_AND_RETRY_COMPLETE.md` - This file (deployment guide)

**Migration Files**:
- `20251108200001_session_and_timeout_fix.sql` - Add features
- `20251108210000_remove_duplicate_device_sessions.sql` - Cleanup

**Edge Function**:
- `supabase/functions/monitor_image_timeouts/index.ts`
- `supabase/functions/monitor_image_timeouts/README.md`

---

## Summary

✅ All code complete
✅ All migrations ready
✅ Edge function ready
✅ UI components built
✅ Documentation complete
✅ Test data available

**The system is production-ready!**

Next action: Apply migrations and hard refresh browser to see the new UI.

🚀
