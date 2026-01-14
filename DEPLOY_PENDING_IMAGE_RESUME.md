# Deploy Pending Image Resume Feature

## Quick Start

This feature enables the MQTT handler to resume interrupted image transfers instead of always requesting new captures.

## Changes Summary

### 1. Code Changes (Completed)
- **New Function**: `publishPendingImageAck()` in `ack.ts` - Sends ACK to resume pending images
- **Modified Logic**: `handleHelloStatus()` in `ingest.ts` - Detects and resumes pending transfers
- **New Protocol State**: `ack_pending_sent` - Tracks when we ACK a pending image

### 2. Database Migration (Manual Step Required)

**File**: `APPLY_PENDING_IMAGE_PROTOCOL_STATE.sql`

**Apply via Supabase Dashboard**:
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `APPLY_PENDING_IMAGE_PROTOCOL_STATE.sql`
3. Paste and run the migration
4. Verify success

**What it does**:
- Adds new `ack_pending_sent` state to protocol_state CHECK constraint
- Updates column documentation

### 3. Edge Function Deployment (Manual Step Required)

**Deploy the updated MQTT handler**:

```bash
# Option 1: Using Supabase CLI (if available)
supabase functions deploy mqtt_device_handler

# Option 2: Via Supabase Dashboard
# 1. Go to Edge Functions
# 2. Select mqtt_device_handler
# 3. Update code from supabase/functions/mqtt_device_handler/
# 4. Deploy
```

## How It Works

### Before (Old Behavior)
```
Device: "I have pendingImg=1"
Server: *ignores* → Sends SNAP command for new capture
Device: *confused* → May not complete either image
```

### After (New Behavior)
```
Device: "I have pendingImg=1"
Server: → Queries database for incomplete images
        → Finds "image_3.jpg" with 5/10 chunks
        → Sends ACK: {"device_id": "...", "image_name": "image_3.jpg", "ACK_OK": {}}
Device: → Continues sending chunks 6, 7, 8, 9, 10
        → Completes image_3.jpg
Server: → Sends final ACK_OK with next_wake_time
```

## Testing Checklist

### Test 1: Normal Flow (No Pending)
- [ ] Device sends HELLO with `pendingImg=0`
- [ ] Server sends SNAP command
- [ ] Check logs: "No pending images - initiating new image capture"
- [ ] Protocol state = `ack_sent`

### Test 2: Resume Pending Image
- [ ] Create incomplete image in DB (status='receiving')
- [ ] Device sends HELLO with `pendingImg=1`
- [ ] Server sends ACK (not SNAP)
- [ ] Check logs: "Resuming pending image transfer: image_X.jpg"
- [ ] Protocol state = `ack_pending_sent`
- [ ] Device completes image transfer

### Test 3: Trust Device Over Database
- [ ] DB has incomplete image but device reports `pendingImg=0`
- [ ] Server sends SNAP (trusts device)
- [ ] Check logs: "No pending images - initiating new image capture"

## Monitoring

### Key Log Messages
```
[Ingest] Device provisioned - checking for pending images
[Ingest] Resuming pending image transfer: image_3.jpg (5/10 chunks)
[ACK] Sending ACK for pending image: {...}
[ACK] Pending image ACK published successfully
```

### Database Queries

**Check for pending image resumes**:
```sql
SELECT
  dwp.payload_id,
  dwp.device_id,
  dwp.protocol_state,
  dwp.server_image_name,
  dwp.captured_at,
  di.received_chunks,
  di.total_chunks,
  di.status
FROM device_wake_payloads dwp
LEFT JOIN device_images di ON di.image_id = dwp.device_image_id
WHERE dwp.protocol_state = 'ack_pending_sent'
ORDER BY dwp.captured_at DESC
LIMIT 20;
```

**Find devices with pending images**:
```sql
SELECT
  d.device_mac,
  d.device_name,
  di.image_name,
  di.status,
  di.received_chunks,
  di.total_chunks,
  di.updated_at,
  EXTRACT(EPOCH FROM (now() - di.updated_at)) / 60 AS age_minutes
FROM device_images di
JOIN devices d ON d.device_id = di.device_id
WHERE di.status IN ('pending', 'receiving')
ORDER BY di.captured_at ASC;
```

## Rollback Plan

If issues occur, rollback is simple since changes are additive:

1. **Redeploy previous version** of mqtt_device_handler edge function
2. **Database**: No rollback needed - new state is optional
3. **Verify**: Check logs show "Device will send automatically" message (old behavior)

## Architecture Decisions

### Why Trust Device Over Database?
The ESP32 firmware is rigid and fragile. If device says it has no pending images, we trust it to avoid recursion storms or firmware crashes.

### Why Empty ACK_OK for Pending Images?
Per protocol spec, `next_wake_time` is only sent in the final ACK after all chunks are received. Intermediate ACKs use empty `ACK_OK: {}`.

### Why No Retry Limits?
Device firmware controls retry behavior. We "go with the flow" to avoid breaking the rigid firmware state machine. Stale images are handled by existing cleanup (1-hour timeout).

### Why Earliest Image by captured_at?
Simplest, most predictable logic. Avoids concurrency issues and matches intuitive expectation (finish oldest work first).

## Related Documentation

- `PENDING_IMAGE_RESUME_IMPLEMENTATION.md` - Full technical details
- `STALE_IMAGE_CLEANUP_IMPLEMENTATION.md` - Stale image handling
- `ESP32_MQTT_PROTOCOL_COMPLETE_GUIDE.md` - Protocol specification
- `APPLY_PENDING_IMAGE_PROTOCOL_STATE.sql` - Database migration

## Support

If you encounter issues:
1. Check Supabase edge function logs for error messages
2. Query database for pending images and wake payloads
3. Verify device firmware version supports `pendingImg` field
4. Review ACK audit trail in device history
