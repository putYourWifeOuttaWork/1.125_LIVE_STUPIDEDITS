# MQTT Protocol Fix - Complete

## Date: January 4, 2026

## Summary
Fixed reversed protocol logic in `mqtt-service/index.js` for handling device status messages with pending images.

## Problem
The MQTT service had reversed logic when handling device status messages:
- When `pendingImg === 0`: Was sending `ACK_OK` (incorrect)
- When `pendingImg > 0`: Was sending `capture_image` (incorrect)

This caused confusion in the device communication flow and prevented proper image capture/transmission.

## Solution

### Changes Made to `/mqtt-service/index.js`:

#### 1. Fixed `handleStatusMessage()` Function (Lines 277-311)

**Before:**
```javascript
if (pendingCount === 0) {
  // Send ACK_OK with next_wake_time
  const ackMessage = {
    device_id: deviceMac,
    ACK_OK: { next_wake_time: nextWakeTime }
  };
  client.publish(`ESP32CAM/${deviceMac}/ack`, JSON.stringify(ackMessage));
}
```

**After:**
```javascript
if (pendingCount === 0) {
  // Device has NO pending images - request a new capture
  const captureCmd = {
    device_id: deviceMac,
    capture_image: true,
  };
  client.publish(`ESP32CAM/${deviceMac}/cmd`, JSON.stringify(captureCmd));
} else {
  // Device HAS pending images - send ACK to proceed with transmission
  const nextWakeTime = await calculateNextWakeTime(device.device_id);
  const ackMessage = {
    device_id: deviceMac,
    ACK_OK: { next_wake_time: nextWakeTime }
  };
  client.publish(`ESP32CAM/${deviceMac}/ack`, JSON.stringify(ackMessage));
}
```

#### 2. Removed Duplicate Capture Command Logic (Lines 1013-1015)

**Before:**
```javascript
} else if (topic.includes('/status')) {
  const result = await handleStatusMessage(payload, client);
  if (result && result.pendingCount > 0) {
    const captureCmd = {
      device_id: payload.device_id,
      capture_image: true,
    };
    client.publish(`ESP32CAM/${payload.device_id}/cmd`, JSON.stringify(captureCmd));
  }
}
```

**After:**
```javascript
} else if (topic.includes('/status')) {
  // Handle status message - logic is now inside handleStatusMessage()
  await handleStatusMessage(payload, client);
}
```

## Correct Protocol Flow

### Scenario 1: Device Connects with NO Pending Images (pendingImg = 0)
1. Device wakes up and sends status message: `{ "device_id": "MAC", "pendingImg": 0 }`
2. Server sends `capture_image` command → Device captures new image
3. Device sends metadata for new image
4. Server sends `send_image` command to request chunks
5. Device sends chunks → Server reassembles → Uploads to storage
6. Server sends `ACK_OK` with next_wake_time
7. Device goes back to sleep

### Scenario 2: Device Connects WITH Pending Images (pendingImg > 0)
1. Device wakes up and sends status message: `{ "device_id": "MAC", "pendingImg": 3 }`
2. Server sends `ACK_OK` with next_wake_time → Device proceeds with transmission
3. Device sends metadata for first pending image
4. Server sends `send_image` command to request chunks
5. Device sends chunks → Server reassembles → Uploads to storage
6. Device sends metadata for next pending image (repeat steps 4-5)
7. When all pending images are sent, device goes back to sleep

## Verification

### Build Status
✅ Project builds successfully with no errors
✅ TypeScript compilation passed
✅ Vite build completed

### Testing Checklist
- [ ] Test device with pendingImg = 0 (should receive capture_image command)
- [ ] Test device with pendingImg > 0 (should receive ACK_OK and proceed with metadata)
- [ ] Verify metadata messages trigger send_image commands
- [ ] Verify chunk reassembly and storage upload
- [ ] Verify submission/observation creation for mapped devices

## Files Modified
- `/mqtt-service/index.js` - Fixed protocol logic in handleStatusMessage() and removed duplicate code

## Related Documentation
- `ESP32_MQTT_PROTOCOL_COMPLETE_GUIDE.md` - Protocol specification
- `MQTT_PROTOCOL_COMPLIANCE_COMPLETE_FIX.md` - Previous compliance fixes
- `mqtt-service/README.md` - Service documentation

## Next Steps
1. Deploy updated MQTT service to production
2. Monitor device connections and image transmission
3. Verify correct behavior with both scenarios (pendingImg = 0 and pendingImg > 0)
4. Check logs for proper command sequencing

## Notes
- The metadata and chunk handling functions remain unchanged (working correctly)
- The reassembly and upload logic remains unchanged (working correctly)
- Device wake schedule calculation remains unchanged (working correctly)
