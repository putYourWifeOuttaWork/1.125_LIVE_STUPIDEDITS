# MQTT Service Debug Deployment Guide

## Issue Summary

Device sends HELLO messages with `pendingImg=7` repeatedly, but the expected `capture_image` command is not being sent by the server.

## Root Cause Analysis

The mqtt-service code at lines 298-320 is **architecturally correct** but appears not to be executing. The logs show a phantom message "[STATUS] Device reports 7 pending images - checking database..." which doesn't exist in the current codebase, indicating:

1. **Stale deployment** - Render.io may be running old cached code
2. **Function not reaching capture_image logic** - Execution may be stopping earlier
3. **Silent publish failure** - MQTT client may not be connected or publish may be failing without error

## Fixes Applied

Added comprehensive debug logging throughout the execution path:

### 1. Message Reception & Routing (Lines 1142-1157)
```javascript
console.log(`[DEBUG] 🔀 Routing message - Topic: ${topic}`);
console.log(`[DEBUG] 📨 Route: STATUS handler - Calling handleStatusMessage`);
```

### 2. Function Entry (Lines 233-234)
```javascript
console.log(`[DEBUG] ⭐ handleStatusMessage CALLED - Entry point`);
console.log(`[DEBUG] Raw payload:`, JSON.stringify(payload, null, 2));
```

### 3. sendPendingCommands Protection (Lines 279-284)
```javascript
try {
  await sendPendingCommands(device, client);
  console.log(`[DEBUG] Completed sendPendingCommands for device ${deviceMac}`);
} catch (pendingError) {
  console.error(`[ERROR] sendPendingCommands failed but continuing:`, pendingError);
}
```

### 4. Detailed capture_image Command Execution (Lines 300-320)
```javascript
console.log(`[DEBUG] Preparing to send capture_image command to ${deviceMac}`);
console.log(`[DEBUG] Client connected: ${client.connected}, deviceMac: ${deviceMac}, pendingCount: ${pendingCount}`);
console.log(`[DEBUG] Publishing to topic: ${cmdTopic}`);
console.log(`[DEBUG] Command payload: ${cmdPayload}`);

client.publish(cmdTopic, cmdPayload);

console.log(`[CMD] ✅ SUCCESSFULLY sent capture_image command to ${deviceMac} (device pending count: ${pendingCount})`);
```

## Deployment Steps

### Step 1: Commit Changes
```bash
git add mqtt-service/index.js
git commit -m "Add comprehensive debug logging for capture_image command flow"
git push
```

### Step 2: Force Fresh Deployment on Render.io

1. Go to Render.io dashboard
2. Navigate to your mqtt-service
3. Click **Manual Deploy** → **Clear build cache & deploy**
4. Wait for deployment to complete
5. Check deployment logs for any errors

### Step 3: Restart Service
```bash
# If you have Render CLI
render services restart <service-id>

# Or use the Render dashboard to restart the service
```

### Step 4: Monitor Logs

Watch for the new debug markers when device sends HELLO:

**Expected log sequence:**
```
[MQTT] 📨 Message on ESP32CAM/XX:XX:XX:XX:XX:XX/status
[MQTT] ✅ Parsed payload: {...}
[DEBUG] 🔀 Routing message - Topic: ESP32CAM/XX:XX:XX:XX:XX:XX/status
[DEBUG] 📨 Route: STATUS handler - Calling handleStatusMessage
[DEBUG] ⭐ handleStatusMessage CALLED - Entry point
[DEBUG] Raw payload: {full JSON}
[STATUS] Device XX:XX:XX:XX:XX:XX (MAC: ..., normalized: ...) is alive, pending images: 7
[STATUS] Battery: 4.2V, RSSI: -45 dBm, Error code: 0
[DEBUG] About to call sendPendingCommands for device XX:XX:XX:XX:XX:XX
[CMD] No pending commands for device DEVICE_001
[DEBUG] Completed sendPendingCommands for device XX:XX:XX:XX:XX:XX
[STATUS] Device reports 7 pending images from offline period
[DEBUG] Preparing to send capture_image command to XX:XX:XX:XX:XX:XX
[DEBUG] Client connected: true, deviceMac: XX:XX:XX:XX:XX:XX, pendingCount: 7
[DEBUG] Publishing to topic: ESP32CAM/XX:XX:XX:XX:XX:XX/cmd
[DEBUG] Command payload: {"device_id":"XX:XX:XX:XX:XX:XX","capture_image":true}
[CMD] ✅ SUCCESSFULLY sent capture_image command to XX:XX:XX:XX:XX:XX (device pending count: 7)
[DEBUG] 📨 STATUS handler completed
```

### Step 5: Diagnostic Analysis

Based on the logs, you'll be able to identify where execution stops:

**If you DON'T see:**
- `[DEBUG] ⭐ handleStatusMessage CALLED` → Message not reaching handler (routing issue)
- `[DEBUG] About to call sendPendingCommands` → Function exiting early (device lookup failure)
- `[DEBUG] Preparing to send capture_image` → sendPendingCommands hanging or throwing
- `[DEBUG] Client connected: true` → MQTT client disconnected
- `[CMD] ✅ SUCCESSFULLY sent` → client.publish throwing error or topic/payload malformed

## Expected Protocol Flow After Fix

1. **Device → HELLO** (with pendingImg=7)
2. **Server → capture_image** (ALWAYS, regardless of pending count)
3. **Device → Metadata** (oldest pending image OR new capture)
4. **Server → send_image** (with image_name from metadata)
5. **Device → Chunks** (sends all chunks or resumes partial)
6. **Server → ACK_OK** (with next_wake_time after assembly complete)
7. **Device → Repeat** (sends next pending image, or sleeps if pendingImg < 1)

## Verification Queries

Check device state in database:
```sql
-- Check device status
SELECT device_code, device_mac, provisioning_status, is_active, last_seen_at
FROM devices
WHERE device_mac = 'XX:XX:XX:XX:XX:XX';

-- Check pending images
SELECT image_id, image_name, status, received_chunks, total_chunks, captured_at
FROM device_images
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'XX:XX:XX:XX:XX:XX')
  AND status IN ('pending', 'receiving')
ORDER BY captured_at ASC;

-- Check for queued commands
SELECT command_id, command_type, status, issued_at
FROM device_commands
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'XX:XX:XX:XX:XX:XX')
  AND status = 'pending';
```

## Troubleshooting

### Issue: Still no capture_image command after deployment

**Check:**
1. Render.io deployment actually completed successfully
2. Service restarted (not just redeployed)
3. New code is running (check for new debug logs)
4. MQTT client is connected (`client.connected = true` in logs)
5. Device is sending to correct topic (`ESP32CAM/{MAC}/status`)

### Issue: client.connected = false

**Fix:**
1. Check HiveMQ Cloud credentials in Render.io environment variables
2. Verify MQTT broker is accessible
3. Check for connection errors in service startup logs
4. Restart the mqtt-service

### Issue: Device not found in database

**Fix:**
1. Run auto-provision manually or check auto-provision logs
2. Verify device MAC normalization is working
3. Check device table for existing record with different MAC format

## Next Steps After Successful Deployment

1. Monitor for metadata message after capture_image is sent
2. Verify UPSERT logic handles resumed images correctly (lines 350-443)
3. Confirm send_image command is sent for resumed transfers (line 480)
4. Test complete image assembly and ACK_OK flow
5. Validate device sends remaining pending images after first ACK_OK

## Files Modified

- `/tmp/cc-agent/51386994/project/mqtt-service/index.js`
  - Lines 233-234: Added function entry logging
  - Lines 279-284: Added error handling for sendPendingCommands
  - Lines 300-320: Added detailed capture_image command logging
  - Lines 1142-1157: Added message routing logging
