# MQTT Protocol Fix - Wake Command Format

## Issue Identified

Device 98A316F6FE18 received an incorrect wake command message format that didn't match the BrainlyTree communications protocol specification.

### What Was Sent (INCORRECT):
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "cron": "0 */3 * * *",
  "timestamp": "2025-11-22T00:23:19.600Z"
}
```

### What Should Be Sent (CORRECT per PDF spec):
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "next_wake": "2025-11-22T03:00:00.000Z"
}
```

## Root Cause

According to the BrainlyTree ESP-CAM Architecture Document (Section 5, page 5):

**Device Protocol Requirements:**
- Devices expect `next_wake` field with an **ISO 8601 UTC timestamp**
- Devices do NOT understand cron expressions - those are for server-side scheduling only
- The device uses this timestamp to calculate its sleep duration and set its RTC timer

**Our Implementation Was Wrong:**
1. Sending `cron` field (internal server format) instead of `next_wake`
2. Sending current `timestamp` instead of calculated future wake time
3. Not calculating the actual next wake time based on the schedule

## Files Fixed

### 1. `/mqtt-service/index.js`

#### Fix 1: `calculateNextWakeTime()` function (lines 576-631)
**Before:** Simple placeholder that just added 12 hours
```javascript
function calculateNextWakeTime() {
  const now = new Date();
  now.setHours(now.getHours() + 12);
  return now.toISOString();
}
```

**After:** Proper calculation using device/site schedule
```javascript
async function calculateNextWakeTime(deviceId) {
  // 1. Get device's wake_schedule_cron
  // 2. Fall back to site's wake_schedule_cron if not set
  // 3. Use default "0 */3 * * *" if neither exists
  // 4. Calculate next wake using fn_calculate_next_wake RPC
  // 5. Return ISO 8601 UTC timestamp
}
```

#### Fix 2: `sendPendingCommands()` - Wake schedule command (lines 133-140)
**Before:** Sent cron expression
```javascript
case 'set_wake_schedule':
  message = {
    device_id: device.device_code || device.device_id,
    set_wake_schedule: command.command_payload?.wake_schedule_cron
  };
  break;
```

**After:** Calculate and send next wake time
```javascript
case 'set_wake_schedule':
  const nextWake = await calculateNextWakeTime(device.device_id);
  message = {
    device_id: device.device_mac,
    next_wake: nextWake // ISO 8601 UTC timestamp
  };
  break;
```

#### Fix 3: `reassembleAndUploadImage()` - ACK_OK message (lines 450-462)
**Before:** Used placeholder next wake time
```javascript
const nextWakeTime = calculateNextWakeTime(); // No device context
const ackMessage = {
  device_id: deviceId,
  image_name: imageName,
  ACK_OK: {
    next_wake_time: nextWakeTime,
    status: 'success',
    image_url: urlData.publicUrl,
  },
};
```

**After:** Calculate based on device schedule, correct format
```javascript
const nextWakeTime = await calculateNextWakeTime(buffer.imageRecord.device_id);
const ackMessage = {
  device_id: buffer.device.device_mac,
  image_name: imageName,
  ACK_OK: {
    next_wake_time: nextWakeTime, // ISO 8601 UTC timestamp per spec
  },
};
```

## Protocol Verification

### Topics (CORRECT - Already matching spec)
- Device publishes to: `device/{MAC}/status`, `device/{MAC}/data` ✓
- Server publishes to: `device/{MAC}/cmd`, `device/{MAC}/ack` ✓

### Message Formats (NOW CORRECT)

#### 1. Status Message (Device → Server)
```json
{
  "device_id": "esp32-cam-01",
  "status": "alive",
  "pendingImg": 1
}
```
✓ Already correct

#### 2. Capture Image Command (Server → Device)
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "capture_image": true
}
```
✓ Already correct

#### 3. Next Wake Command (Server → Device)
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "next_wake": "2025-11-22T15:00:00.000Z"
}
```
✓ NOW FIXED

#### 4. Send Image Command (Server → Device)
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "send_image": "image_001.jpg"
}
```
✓ Already correct

#### 5. ACK_OK Message (Server → Device)
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "image_name": "image_001.jpg",
  "ACK_OK": {
    "next_wake_time": "2025-11-22T15:00:00.000Z"
  }
}
```
✓ NOW FIXED

#### 6. Missing Chunks Message (Server → Device)
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "image_name": "image_001.jpg",
  "missing_chunks": [5, 10, 23]
}
```
✓ Already correct

## Device Wake Schedule Flow

1. **Device wakes up** → Publishes HELLO to `device/{MAC}/status`
2. **Server receives HELLO** → Checks for pending commands
3. **Server sends command** → Publishes to `device/{MAC}/cmd` with calculated `next_wake`
4. **Device receives command** → Parses `next_wake` timestamp
5. **Device calculates sleep** → `sleep_duration = next_wake - current_time`
6. **Device sets RTC timer** → Programs deep sleep with calculated duration
7. **Device sleeps** → Enters deep sleep mode
8. **RTC wakes device** → At the scheduled `next_wake` time

## Testing

To test with device 98A316F6FE18:

1. **Restart MQTT service** to load the fixed code
2. **Send wake command** via device_commands table or wake button
3. **Verify message format** in MQTT logs - should show:
   ```
   [CMD] Sent set_wake_schedule to 98A316F6FE18
   {
     "device_id": "98:A3:16:F6:FE:18",
     "next_wake": "2025-11-22T15:00:00.000Z"  // Actual calculated time
   }
   ```
4. **Monitor device response** - device should acknowledge and sleep until scheduled time

## Next Steps

1. Restart the MQTT service to apply the fix
2. Test with the live device 98A316F6FE18
3. Verify the device correctly sleeps and wakes at scheduled times
4. Monitor device battery consumption (should be much better with proper sleep)

## References

- BrainlyTree ESP-CAM Architecture Document (Section 5: Communication Protocol & JSON Payload format)
- Migration `20251115000000_device_provisioning_automation.sql` (fn_calculate_next_wake function)
