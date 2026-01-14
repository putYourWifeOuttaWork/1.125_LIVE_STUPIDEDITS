# Pending Image Resume Implementation

## Overview

Implemented support for resuming interrupted image transfers when a device reports `pendingImg > 0` in its HELLO message. The server now detects incomplete images in the database and sends an ACK to allow the device to continue sending chunks instead of always commanding a new capture.

## Key Design Decisions

### 1. Priority: Truly Pending vs Receiving
**Decision**: Query for earliest pending image by `captured_at` timestamp, regardless of whether it's 'pending' (0 chunks) or 'receiving' (partial chunks).

**Rationale**: Simplest logic that avoids concurrency errors. The device firmware is rigid, so we follow its flow rather than imposing complex retry logic.

### 2. Trust Device vs Database
**Decision**: If device reports `pendingImg=0` but DB has pending images, trust the device and proceed with new capture (SNAP command).

**Rationale**: Device firmware is the source of truth for its internal state. Server adapts to device, not vice versa.

### 3. ACK Message Format for Pending Images
**Decision**: Send ACK with empty `ACK_OK` object (no `next_wake_time` included).

**Format**:
```json
{
  "device_id": "macAddress",
  "Image_name": "image_#.jpg",
  "ACK_OK": {}
}
```

**Rationale**: Per protocol spec, `next_wake_time` is only sent in final ACK after all chunks received. Intermediate ACKs for pending images use empty object.

### 4. Retry Limits
**Decision**: No retry limits or abandonment logic implemented.

**Rationale**: Device firmware is very rigid and will enter recursion storms or break easily. We "go with the flow" and let the firmware control retry behavior. Stale images are handled by the existing cleanup system (marks as 'failed' after 1 hour).

### 5. Completion Flow
**Decision**: Existing completion logic unchanged - final ACK_OK with `next_wake_time` sent after all chunks received.

**Rationale**: This already works correctly. The resume flow only affects the initial HELLO response; completion remains the same.

## Implementation Details

### Files Modified

#### 1. `/supabase/functions/mqtt_device_handler/ack.ts`

**Added**: `publishPendingImageAck()` function

```typescript
export async function publishPendingImageAck(
  client: MqttClient | null,
  deviceMac: string,
  imageName: string,
  supabase?: SupabaseClient
): Promise<void>
```

- Publishes to `/ack` topic (NOT `/cmd`)
- Message format: `{"device_id": "mac", "image_name": "img.jpg", "ACK_OK": {}}`
- Logs to audit trail with type `PENDING_IMAGE_ACK`
- Supports HTTP mode (null client)

#### 2. `/supabase/functions/mqtt_device_handler/ingest.ts`

**Modified**: `handleHelloStatus()` function (lines 320-379)

**Logic Flow**:
1. Check if device is provisioned and mapped
2. Extract `pending_count` from payload
3. Query database for oldest incomplete image:
   ```sql
   SELECT image_id, image_name, status, received_chunks, total_chunks
   FROM device_images
   WHERE device_id = ? AND status IN ('pending', 'receiving')
   ORDER BY captured_at ASC
   LIMIT 1
   ```
4. **If** `pendingCount > 0` AND database has pending image:
   - Update wake_payload with `protocol_state = 'ack_pending_sent'`
   - Link to existing `device_image_id`
   - Send pending image ACK
   - Log: "Resuming pending image transfer"
5. **Else** (no pending or device reports 0):
   - Update wake_payload with `protocol_state = 'ack_sent'`
   - Send SNAP command for new capture
   - Log: "No pending images - initiating new image capture"

**Removed**: The old comment about "Device will send automatically - no action needed" was removed since we now actively handle pending images.

#### 3. Database Migration

**File**: `APPLY_PENDING_IMAGE_PROTOCOL_STATE.sql`

**Changes**:
- Added new protocol state: `ack_pending_sent`
- Updated CHECK constraint on `device_wake_payloads.protocol_state`
- Updated column comment with new state documentation

**States**:
- `hello_received` - Device sent HELLO
- `ack_sent` - Server sent ACK (normal flow)
- `ack_pending_sent` - **NEW**: Server sent ACK for pending image resume
- `snap_sent` - Server sent SNAP command
- `metadata_received` - Got metadata, receiving chunks
- `complete` - Image complete, SLEEP sent
- `failed` - Protocol flow failed
- `sleep_only` - Just send SLEEP (no schedule/unmapped)

## Protocol Flow Diagrams

### Normal Flow (No Pending Images)
```
Device                           Server                    Database
  |                                |                          |
  |-- HELLO (pendingImg=0) ------->|                          |
  |                                |-- Check for pending ---->|
  |                                |<-- None found -----------|
  |                                |-- Update state: ack_sent |
  |<---- SNAP command -------------|                          |
  |-- Capture image                |                          |
  |-- Metadata ------------------>|                          |
  |-- Chunks -------------------->|-- Store chunks --------->|
  |<---- ACK_OK w/ next_wake ------|-- Complete -------------->|
  |-- Sleep until next_wake        |                          |
```

### Resume Flow (Pending Images Found)
```
Device                           Server                    Database
  |                                |                          |
  |-- HELLO (pendingImg=1) ------->|                          |
  |                                |-- Check for pending ---->|
  |                                |<-- Found image_3.jpg ----|
  |                                |-- Update state: ack_pending_sent
  |                                |-- Link device_image_id --|
  |<---- ACK for image_3.jpg ------|                          |
  |-- Continue sending chunks      |                          |
  |-- Chunk 5 ------------------->|-- Store chunk ---------->|
  |-- Chunk 6 ------------------->|-- Store chunk ---------->|
  |-- Chunk 7 (final) ----------->|-- Complete image ------->|
  |<---- ACK_OK w/ next_wake ------|                          |
  |-- Sleep until next_wake        |                          |
```

## Testing Approach

### Test Scenario 1: Normal Flow (No Pending)
1. Device sends HELLO with `pendingImg=0`
2. Verify server sends SNAP command
3. Verify protocol_state = 'ack_sent'
4. Check logs: "No pending images - initiating new image capture"

### Test Scenario 2: Resume Pending Image
1. Create incomplete image in database (status='receiving', received_chunks=5, total_chunks=10)
2. Device sends HELLO with `pendingImg=1`
3. Verify server sends ACK (not SNAP)
4. Verify ACK message format: `{"device_id": "...", "image_name": "...", "ACK_OK": {}}`
5. Verify protocol_state = 'ack_pending_sent'
6. Verify device_image_id linked in wake_payload
7. Check logs: "Resuming pending image transfer: image_X.jpg (5/10 chunks)"

### Test Scenario 3: Trust Device Over Database
1. Create incomplete image in database
2. Device sends HELLO with `pendingImg=0`
3. Verify server sends SNAP (not ACK)
4. Verify new image capture initiated
5. Check logs: "No pending images - initiating new image capture"

### Test Scenario 4: Missing Database Record
1. Device sends HELLO with `pendingImg=1`
2. No incomplete images in database
3. Verify server sends SNAP command (fallback)
4. Verify protocol_state = 'ack_sent'
5. Check logs: "No pending images - initiating new image capture"

## Edge Cases Handled

1. **Device reports pending but DB has none**: Fall back to SNAP command
2. **DB has pending but device reports 0**: Trust device, send SNAP
3. **Multiple pending images**: Select oldest by `captured_at` timestamp
4. **Unmapped/unprovisioned device**: Existing SLEEP-only flow unchanged
5. **Manual wake override**: Existing override logic unchanged

## Backward Compatibility

- **Devices without pending images**: Normal flow unchanged
- **Existing firmware**: Works with both old and new firmware
- **Existing wake payloads**: Migration not required (nullable column)
- **Existing stale image cleanup**: Works independently

## Database Impact

- **New query**: Single SELECT on device_images table
  - Indexed columns: `device_id`, `status`, `captured_at`
  - Fast query (LIMIT 1, indexed)
- **New protocol state**: Single constraint update
- **No breaking changes**: All existing states still valid

## Monitoring & Debugging

### Log Messages
- `[Ingest] Device provisioned - checking for pending images`
- `[Ingest] Resuming pending image transfer: image_X.jpg (5/10 chunks)`
- `[Ingest] No pending images - initiating new image capture`
- `[ACK] Sending ACK for pending image: {...}`
- `[ACK] Pending image ACK published successfully`

### Audit Trail
- All ACKs logged via `fn_log_device_ack` RPC
- ACK type: `PENDING_IMAGE_ACK`
- Includes full MQTT payload for debugging

### Database Queries for Debugging
```sql
-- Check wake payloads with pending image resumes
SELECT *
FROM device_wake_payloads
WHERE protocol_state = 'ack_pending_sent'
ORDER BY captured_at DESC
LIMIT 10;

-- Find devices with pending images
SELECT
  d.device_mac,
  d.device_name,
  di.image_name,
  di.status,
  di.received_chunks,
  di.total_chunks,
  di.captured_at
FROM device_images di
JOIN devices d ON d.device_id = di.device_id
WHERE di.status IN ('pending', 'receiving')
ORDER BY di.captured_at ASC;
```

## Deployment Checklist

- [x] Add `publishPendingImageAck()` function
- [x] Modify HELLO handler logic
- [x] Create database migration file
- [ ] Apply database migration via Supabase Dashboard
- [ ] Deploy updated edge function
- [ ] Monitor logs for pending image resumes
- [ ] Test with real device reporting pendingImg > 0
- [ ] Verify stale image cleanup still works

## Next Steps

1. **Apply Migration**: Run `APPLY_PENDING_IMAGE_PROTOCOL_STATE.sql` in Supabase Dashboard
2. **Deploy Function**: Push updated `mqtt_device_handler` edge function
3. **Monitor**: Watch for log messages about pending image resumes
4. **Validate**: Confirm devices successfully resume interrupted transfers
5. **Document**: Update ESP32-CAM protocol documentation with resume flow

## Related Files

- `supabase/functions/mqtt_device_handler/ack.ts` - ACK publishing functions
- `supabase/functions/mqtt_device_handler/ingest.ts` - HELLO message handler
- `supabase/functions/mqtt_device_handler/protocol.ts` - Protocol definitions
- `APPLY_PENDING_IMAGE_PROTOCOL_STATE.sql` - Database migration
- `STALE_IMAGE_CLEANUP_IMPLEMENTATION.md` - Related stale image handling
