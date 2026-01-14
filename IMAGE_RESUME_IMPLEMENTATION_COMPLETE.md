# Image Resume Implementation - COMPLETE

## Overview

Implemented support for firmware-managed image resume across multiple wake sessions. When a device's image transfer is interrupted, it can resume transmission in subsequent wake cycles without losing progress.

## Implementation Date
January 6, 2026

## How It Works

### Firmware Responsibility
- Firmware maintains queue of pending images
- Reports `pendingImg` count in HELLO message
- Automatically sends pending image metadata and chunks on subsequent wakes
- Server adapts to continue transfer regardless of when chunks arrive

### Server Responsibility
- Detects when metadata arrives for existing incomplete images
- Updates existing image record instead of creating duplicates
- Assembles chunks across multiple sessions
- Logs duplicate complete images for debugging

## Key Components

### 1. Database Schema

**Unique Constraint:**
- `device_images(device_id, image_name)` - Prevents duplicate image records

**New Table: `duplicate_images_log`**
- Tracks when complete images receive duplicate metadata
- Used for firmware debugging and analytics

**New Functions:**
- `fn_check_image_resumable()` - Check if image can be resumed
- `fn_log_duplicate_image()` - Log duplicate metadata events
- `fn_wake_ingestion_handler()` - Updated to support resume via `p_existing_image_id` parameter

**New View: `incomplete_images_report`**
- Shows all incomplete/failed images for monitoring
- Includes completion percentage, time since last update
- Links to last wake payload attempt

### 2. MQTT Service Changes

**File:** `mqtt-service/index.js`

**Function:** `handleMetadataMessage()`

Three-path logic for metadata handling:

1. **New Image (no existing record):**
   - INSERT new device_images record
   - Log: "New image transfer starting"
   - Start fresh chunk collection

2. **Complete Image (status='complete'):**
   - Call `fn_log_duplicate_image` RPC
   - Log: "Duplicate metadata for complete image - logging and ignoring"
   - Return early, don't process chunks
   - Prevents firmware bugs from corrupting completed transfers

3. **Incomplete Image (status='pending' or 'receiving'):**
   - UPDATE existing device_images record
   - Preserve `received_chunks` count (don't reset to 0)
   - Log: "Resuming incomplete image transfer: X (Y/Z chunks already received)"
   - Continue adding chunks to existing buffer

### 3. Edge Function Changes

**File:** `supabase/functions/mqtt_device_handler_bundled/index.ts`

**Function:** `handleMetadata()`

Similar three-path logic:

1. Check for existing image by (device_id, image_name)
2. If complete: log duplicate and return
3. If incomplete: pass `p_existing_image_id` to `fn_wake_ingestion_handler`
4. New images: pass NULL for existing_image_id

**Function:** `handleHelloStatus()`

Simplified to remove server-side resume logic:
- Removed pending image ACK sending (firmware handles this)
- Added diagnostic logging for `pendingImg` count
- Server always sends capture_image command
- Firmware decides whether to capture new or send pending

### 4. Chunk Assembly

**No changes needed** - already supports resume:
- `edge_chunk_buffer` table has unique constraint on chunk_key
- `upsert` with `ignoreDuplicates` handles duplicate chunks
- `assembleImage()` queries all chunks by device_mac + image_name
- Works regardless of when chunks arrived

## Protocol Flow

### Normal Flow (No Pending Images)
```
Device sends HELLO (pendingImg=0)
→ Server sends capture_image command
→ Device captures new image
→ Device sends metadata
→ Server: New image detected, INSERT record
→ Device sends chunks 0-99
→ Server assembles and uploads
→ Server sends ACK_OK with next_wake_time
```

### Resume Flow (Device Has Pending)
```
Session 1:
  Device sends HELLO (pendingImg=0)
  → Device captures image_X.jpg
  → Device sends metadata
  → Device sends chunks 0-50 [DISCONNECT]
  → Database has: image_X.jpg, received_chunks=51, status='receiving'

Session 2 (device reboot/reconnect):
  Device sends HELLO (pendingImg=1)
  → Server logs: "Device reports 1 pending images"
  → Server sends capture_image (ignored by firmware)
  → Device sends metadata for image_X.jpg (from queue)
  → Server detects existing incomplete image_X.jpg
  → Server: UPDATE record, preserve received_chunks=51
  → Device sends chunks 51-99
  → Server assembles all 100 chunks (0-99)
  → Upload successful
  → Server sends ACK_OK with next_wake_time
```

### Duplicate Complete Image
```
Device sends metadata for image_Y.jpg (already complete)
→ Server detects status='complete'
→ Server calls fn_log_duplicate_image()
→ Record saved to duplicate_images_log table
→ Server returns early (no chunk processing)
→ Original complete image remains intact
```

## Database Migration

**File:** `APPLY_IMAGE_RESUME_MIGRATION.sql`

Apply this migration via Supabase Dashboard SQL Editor:

1. Adds UNIQUE constraint on device_images
2. Creates duplicate_images_log table with RLS
3. Creates helper functions
4. Creates incomplete_images_report view
5. Updates column comments

**Important:** Run this migration BEFORE deploying code changes.

## Testing Scenarios

### Test 1: Clean Continuation
- Session 1: Receive chunks 1-30 of 100, disconnect
- Session 2: Resume from chunk 31-100
- Expected: All 100 chunks assembled, single image record

### Test 2: Duplicate Complete Image
- Session 1: Image fully transmitted, status='complete'
- Session 2: Same metadata arrives (firmware bug)
- Expected: Logged to duplicate_images_log, original image intact

### Test 3: Device Loses Queue
- Database has incomplete image_X.jpg
- Device reboots, pendingImg=0
- Device captures new image_Y.jpg (different timestamp)
- Expected: Old image_X marked failed by cleanup, new image_Y processed

### Test 4: Interleaved Chunks
- Receive chunks 1-10
- Disconnect
- Receive chunks 5-15 (some duplicates)
- Expected: 15 unique chunks, duplicates ignored via upsert

### Test 5: Multiple Pending Images
- Device has image_1, image_2, image_3 pending
- Each wake transfers one image
- Expected: Each image processed independently, correct association

## Monitoring

### Log Messages

**MQTT Service:**
```
[METADATA] New image transfer starting
[METADATA] Resuming incomplete image transfer: image_X.jpg (50/100 chunks already received)
[METADATA] Duplicate metadata for complete image image_Y.jpg - logging and ignoring
[SUCCESS] Updated image record abc-123 - resuming from chunk 50
```

**Edge Function:**
```
[Ingest] Device reports 2 pending images - firmware will auto-resume on next transfer
[Ingest] Resume detected - continuing image transfer: {image_id, received_chunks, total_chunks}
[Ingest] Duplicate metadata for complete image image_Z.jpg - logging and ignoring
```

### Database Queries

**Check incomplete images:**
```sql
SELECT * FROM incomplete_images_report;
```

**Check resume activity:**
```sql
SELECT
  device_code,
  image_name,
  status,
  received_chunks,
  total_chunks,
  updated_at
FROM device_images di
JOIN devices d ON di.device_id = d.device_id
WHERE status IN ('pending', 'receiving')
ORDER BY updated_at DESC;
```

**Check duplicates:**
```sql
SELECT
  d.device_code,
  dl.image_name,
  dl.duplicate_received_at,
  dl.duplicate_metadata
FROM duplicate_images_log dl
JOIN devices d ON dl.device_id = d.device_id
ORDER BY dl.duplicate_received_at DESC;
```

## Deployment Checklist

- [x] Create database migration file
- [ ] Apply migration via Supabase Dashboard
- [x] Update mqtt-service handleMetadataMessage()
- [x] Update edge function handleMetadata()
- [x] Simplify HELLO handler (remove ACK logic)
- [ ] Deploy updated mqtt-service (restart required)
- [ ] Deploy updated edge function
- [ ] Monitor logs for resume activity
- [ ] Test with real device

## Rollback Plan

If issues occur:

1. **Database:** Unique constraint can stay (doesn't break anything)
2. **Code:** Revert mqtt-service and edge function changes
3. **Migration:** Run rollback script to drop new functions/tables

## Benefits

1. **Data Integrity:** No image data lost due to connection interruptions
2. **Efficient:** Only missing chunks transmitted, not entire image
3. **Firmware Simple:** Device manages queue, server adapts
4. **Observable:** Clear logging and monitoring for resume events
5. **Robust:** Handles edge cases (duplicates, mismatches, stale images)

## Future Enhancements

1. Add metrics: Count of resumed transfers per device
2. Add alerts: Too many failed resumes indicates device issues
3. Add API endpoint: Query incomplete images for a device
4. Add UI indicator: Show resume progress in device detail view

## Status

✅ **IMPLEMENTATION COMPLETE** - January 6, 2026

Ready for database migration and deployment. Server now fully supports firmware-managed image resume across multiple wake sessions.
