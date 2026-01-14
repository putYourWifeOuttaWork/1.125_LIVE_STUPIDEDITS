# Pending Image Resume - FAQ

Quick answers to your questions about the pending image resume implementation.

## Your Questions & Answers

### Q: Should we prioritize truly "pending" images over "receiving" images?

**A: No prioritization needed.**

We query for the **earliest incomplete image** by `captured_at` timestamp, regardless of whether it has 0 chunks (pending) or partial chunks (receiving).

**Reasoning**: Simplest logic that avoids concurrency errors. The firmware is rigid, so we keep the server logic simple and defensive.

**Implementation**:
```sql
SELECT * FROM device_images
WHERE device_id = ? AND status IN ('pending', 'receiving')
ORDER BY captured_at ASC  -- Earliest first
LIMIT 1
```

---

### Q: If we find a pending image in the database but the device reports pendingImg=0, what should we do?

**A: Trust the device.**

If device reports `pendingImg=0`, we send a SNAP command for new capture, even if the database shows incomplete images.

**Reasoning**: The device firmware is the source of truth for its internal state. Going against it can cause recursion storms or firmware crashes. We "go with the flow."

**Implementation**:
```typescript
if (pendingCount > 0 && pendingImage) {
  // Resume pending image
  await publishPendingImageAck(...);
} else {
  // Trust device, send SNAP for new capture
  await publishSnapCommand(...);
}
```

---

### Q: Does the ACK message for pending images need nextWakeTime included?

**A: No, use empty ACK_OK object.**

Per protocol specification:
```json
{
  "device_id": "macAddress",
  "Image_name": "image_#.jpg",
  "ACK_OK": {}
}
```

**Reasoning**: The `next_wake_time` is only sent in the **final** ACK_OK after all chunks are received. Intermediate ACKs for pending images use an empty object.

**Implementation**:
```typescript
const message = {
  device_id: normalizedMac,
  image_name: imageName,
  ACK_OK: {},  // Empty - no next_wake_time yet
};
```

---

### Q: Should we limit how many times we retry a pending image before abandoning it?

**A: No retry limits.**

We do not implement retry counters or abandonment logic for pending images.

**Reasoning**: The device firmware is very rigid and will enter recursion storms or break easily if we try to control retries. We "go with the flow" and let the firmware manage its own retry behavior.

**Stale Image Handling**: Existing cleanup system marks images as 'failed' after 1 hour of no progress. This is handled separately by the stale image cleanup feature (not part of pending image resume logic).

---

### Q: Does "Clear Stale Images" button hard delete all incomplete images?

**A: No, it marks them as 'failed' (soft delete).**

The "Clear Stale Images" button:
- Changes `status` from 'pending'/'receiving' to **'failed'**
- Sets `failed_at` timestamp
- Adds `timeout_reason` = "Manually cleared by user"
- Creates audit trail in device_history table
- **Preserves all data** for analysis

**What it does NOT do**:
- ❌ Hard delete records from database
- ❌ Remove image data
- ❌ Clear audit history

**Why**: Data preservation for troubleshooting and analytics.

---

## Summary

| Question | Answer |
|----------|--------|
| **Priority** | Earliest by `captured_at` (no special priority for 0-chunk vs partial) |
| **Trust** | Always trust device's `pendingImg` count over database |
| **ACK Format** | Empty `ACK_OK: {}` for pending images (no next_wake_time) |
| **Retry Limits** | None - device firmware controls retries |
| **Clear Stale** | Soft delete (marks as 'failed', preserves data) |

## Flow Diagram

```
Device Reports pendingImg > 0
         |
         v
Server Queries DB for Incomplete Images
         |
    ┌────┴────┐
    |         |
  Found     Not Found
    |         |
    v         v
 Send ACK   Send SNAP
(Resume)   (New Capture)
```

## Implementation Files

1. **`ack.ts`** - New function: `publishPendingImageAck()`
2. **`ingest.ts`** - Modified: `handleHelloStatus()` with pending image detection
3. **Migration SQL** - New protocol state: `ack_pending_sent`

## Testing

See `DEPLOY_PENDING_IMAGE_RESUME.md` for testing checklist and monitoring queries.

## Related Documents

- `PENDING_IMAGE_RESUME_IMPLEMENTATION.md` - Full technical details
- `DEPLOY_PENDING_IMAGE_RESUME.md` - Deployment guide
- `STALE_IMAGE_CLEANUP_IMPLEMENTATION.md` - Stale image handling
