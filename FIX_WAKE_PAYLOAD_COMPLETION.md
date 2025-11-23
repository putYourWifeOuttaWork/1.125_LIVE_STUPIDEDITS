# Fix: Wake Payload Completion Logic

## Root Cause

Wake payloads are stuck in 'pending' status because the code only marks them 'complete' 
when an image finishes transmission. However, **a wake is complete as soon as the device 
wakes up and transmits data**, regardless of whether it includes an image.

## Current Broken Flow

1. Device wakes up → creates wake_payload with `payload_status = 'pending'`
2. Device sends telemetry-only → payload stays 'pending' FOREVER
3. Device sends image → payload only marked 'complete' after image finishes
4. Result: 100% of payloads stuck in 'pending', all counters show zero

## Correct Logic

A "wake" is a binary event - it either happened or it didn't:
- `payload_status = 'complete'` → Device woke up and transmitted (SUCCESS)
- `payload_status = 'failed'` → Device was expected to wake but never did (TIMEOUT/NO CONTACT)

The image status is SEPARATE:
- `image_status = 'pending'` → Waiting for image chunks
- `image_status = 'receiving'` → Chunks arriving
- `image_status = 'complete'` → Image fully received and processed
- `image_status = 'failed'` → Image transmission failed
- `image_status = NULL` → No image expected (telemetry-only wake)

## Fix Required

### 1. HELLO Message Handler (ingest.ts)
When device sends HELLO status, mark wake_payload complete immediately:

```typescript
// After creating wake_payload from HELLO
const { error: completeError } = await supabase
  .from('device_wake_payloads')
  .update({ payload_status: 'complete' })
  .eq('payload_id', wakePayloadId);
```

### 2. Telemetry-Only Handler (ingest.ts)
When device sends telemetry without image, mark payload complete:

```typescript
// After resolving lineage and validating telemetry
// Create or update wake_payload with status='complete'
```

### 3. Image Metadata Handler (ingest.ts)
When device starts sending image, payload is already complete (device woke up).
Keep finalize.ts logic but remove the dependency on image completion for wake status.

### 4. Timeout System
Payloads that stay 'pending' for >120 seconds should be marked 'failed':
- This means device never woke up or lost connection before transmitting

## Expected Result

- Device wakes + sends data → `payload_status = 'complete'` immediately
- Session counters update in real-time via triggers
- UI shows accurate wake counts
- Image processing is independent of wake completion
