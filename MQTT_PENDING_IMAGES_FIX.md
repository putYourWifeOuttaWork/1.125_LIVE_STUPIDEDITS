# MQTT Pending Images Protocol Fix

## Issue
Devices with pending images (`pendingImg: 1`) were being immediately sent ACK_OK with next_wake_time, causing them to go to sleep WITHOUT transmitting their pending images.

## Root Cause
The MQTT service handler had incorrect conditional logic that treated devices with pending images differently:
- `pendingImg: 0` → Send `capture_image` command ✅
- `pendingImg: 1+` → Send `ACK_OK` immediately ❌ (WRONG!)

This violated the BrainlyTree ESP32-CAM protocol specification (Section 8.5) which requires:
1. Device sends Alive with pendingImg count
2. Server sends `capture_image` command
3. Device sends metadata (from pending queue or new capture)
4. Server sends `send_image` command
5. Device sends chunks
6. Server verifies and sends ACK_OK with next_wake_time

## Solution
**File:** `/mqtt-service/index.js`
**Function:** `handleStatusMessage()` (lines 274-309)

**Changed:** Remove conditional handling of `pendingImg`. ALWAYS send `capture_image` command when device sends Alive message.

**Why This Works:**
- The device firmware knows whether to capture a new image or send a pending one
- The server doesn't need to decide this - it just initiates the standard protocol flow
- ACK_OK is correctly sent AFTER image reassembly (in `reassembleAndUploadImage()` function)

## Protocol Flow (Fixed)

### Scenario 1: Device with No Pending Images
```
Device → Server: {"device_id":"MAC","status":"Alive","pendingImg":0}
Server → Device: {"device_id":"MAC","capture_image":true}
Device captures new image
Device → Server: Metadata on /data topic
Server → Device: {"device_id":"MAC","send_image":"image_1.jpg"}
Device → Server: Chunks on /data topic
Server → Device: {"device_id":"MAC","image_name":"image_1.jpg","ACK_OK":{"next_wake_time":"3:00PM"}}
Device sleeps until 3:00PM
```

### Scenario 2: Device with 1 Pending Image (NOW FIXED)
```
Device → Server: {"device_id":"MAC","status":"Alive","pendingImg":1}
Server → Device: {"device_id":"MAC","capture_image":true}  ✅ FIXED!
Device sends pending image metadata from queue
Device → Server: Metadata on /data topic
Server → Device: {"device_id":"MAC","send_image":"image_pending.jpg"}
Device → Server: Chunks on /data topic
Server → Device: {"device_id":"MAC","image_name":"image_pending.jpg","ACK_OK":{"next_wake_time":"3:00PM"}}
Device wakes again, now with pendingImg:0
```

### Scenario 3: Device with Multiple Pending Images
```
Device → Server: {"device_id":"MAC","status":"Alive","pendingImg":5}
Server → Device: {"device_id":"MAC","capture_image":true}
[First image transmission completes]
Server → Device: ACK_OK with next_wake_time

Device wakes again at scheduled time
Device → Server: {"device_id":"MAC","status":"Alive","pendingImg":4}
Server → Device: {"device_id":"MAC","capture_image":true}
[Second image transmission completes]
Server → Device: ACK_OK with next_wake_time

... repeats until all 5 images transmitted ...
```

## Testing

### Test Case 1: Device with pendingImg:1
**Expected Logs:**
```
[STATUS] Device reports 1 pending images from offline period
[CMD] Sent capture_image command to 98A316F82928 (device pending count: 1)
[METADATA] Received for image image_1.jpg from 98A316F82928
[CMD] Sent send_image command for image_1.jpg to 98A316F82928
[CHUNK] Received chunk 1/89 for image_1.jpg
...
[ACK] Sent ACK_OK to DEVICE-ESP32S3-008 with next wake: 3:28AM
```

**NOT:**
```
[ACK] Device has 1 pending images - sent ACK_OK (BAD!)
```

### Test Case 2: Verify No Immediate ACK_OK
- Device sends Alive with pendingImg:1
- Should NOT see ACK_OK sent immediately
- Should see capture_image command sent
- Should see normal metadata → send_image → chunks → ACK_OK flow

### Test Case 3: Offline Recovery
- Device has been offline for 5 days (5 pending images)
- Device reconnects and sends pendingImg:5
- Each wake cycle transmits one image
- After 5 cycles, pendingImg:0 and device captures new image

## Code Changes Summary

**Before:**
```javascript
if (pendingCount === 0) {
  // Send capture_image
} else {
  // Send ACK_OK immediately (WRONG!)
}
```

**After:**
```javascript
// Log pending count for diagnostics
if (pendingCount > 0) {
  console.log(`[STATUS] Device reports ${pendingCount} pending images`);
}

// ALWAYS send capture_image command
const captureCmd = { device_id: deviceMac, capture_image: true };
client.publish(`ESP32CAM/${deviceMac}/cmd`, JSON.stringify(captureCmd));
```

## Benefits
1. **Protocol Compliance:** Matches BrainlyTree PDF specification exactly
2. **Offline Recovery:** Devices can successfully transmit image backlog after network outage
3. **Simplified Logic:** One code path for all cases - easier to maintain
4. **No Firmware Changes:** Fix is server-side only, no device updates needed
5. **Data Integrity:** All captured images are transmitted, none lost

## References
- BrainlyTree ESP32-CAM Architecture PDF Section 8.5 (Recovery & Synchronization)
- MQTT Protocol Flow Diagram (Page 10 of PDF)
- Test Plan Section 10.3 (E2E-01: 5-day offline mode)

## Status
✅ **FIXED** - January 5, 2026

The MQTT service now correctly handles devices with pending images by always initiating the standard protocol flow with `capture_image` command, regardless of the pending image count.
