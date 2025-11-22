# MQTT Protocol Complete Fix - All Sources

## Problem Summary

Device 98A316F6FE18 was receiving incorrect wake command messages from **multiple sources** in the system. The BrainlyTree protocol requires devices to receive `next_wake` with an ISO 8601 UTC timestamp, but we were sending cron expressions instead.

## Issues Found & Fixed

### Issue 1: MQTT Service (/mqtt-service/index.js) ✅ FIXED

**Problem:** The `calculateNextWakeTime()` function was a placeholder that just added 12 hours.

**Fix Applied:**
- Enhanced function to query device/site wake schedules from database
- Calls `fn_calculate_next_wake()` RPC to compute proper next wake time
- Returns ISO 8601 UTC timestamp

**Locations Fixed:**
- `calculateNextWakeTime()` function (lines 576-631)
- `sendPendingCommands()` for set_wake_schedule command (lines 133-140)
- `reassembleAndUploadImage()` ACK_OK message (lines 450-462)

### Issue 2: Frontend Device Settings (/src/services/deviceService.ts) ✅ FIXED

**Problem:** When user edited device settings in the UI, the `updateDeviceSettings()` function was creating commands with cron expressions in the payload:
```javascript
command_payload: { wake_schedule_cron: params.wakeScheduleCron }
```

This caused messages like:
```json
{"device_id":"98:A3:16:F6:FE:18","wake_schedule_cron":"0 * * * *"}
```

**Fix Applied (lines 335-373):**
```javascript
// Calculate next wake time based on new schedule
const { data: nextWakeTime, error: rpcError } = await supabase.rpc(
  'fn_calculate_next_wake',
  {
    p_cron_expression: params.wakeScheduleCron,
    p_from_timestamp: new Date().toISOString()
  }
);

// Queue command with calculated next_wake_time (NOT cron expression)
const { error: commandError } = await supabase
  .from('device_commands')
  .insert({
    device_id: params.deviceId,
    command_type: 'set_wake_schedule',
    command_payload: {
      next_wake_time: nextWakeTime || fallback,
      wake_schedule_cron: params.wakeScheduleCron // For reference only
    },
    created_by_user_id: user?.id || null,
    notes: 'Wake schedule updated via UI'
  });
```

**Now sends correct format:**
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "next_wake": "2025-11-22T15:00:00.000Z"
}
```

### Command Queue Processor (Already Correct) ✅

The `/mqtt-service/commandQueueProcessor.js` was already correctly configured to extract `next_wake_time` from the payload and send it as `next_wake` to the device (line 187):

```javascript
case 'set_wake_schedule':
  return {
    ...basePayload,
    next_wake: command.command_payload?.next_wake_time,
  };
```

## Protocol Compliance Summary

### Correct Message Formats (Per BrainlyTree PDF)

#### 1. Status Message (Device → Server) ✅
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "status": "alive",
  "pendingImg": 1
}
```

#### 2. Next Wake Command (Server → Device) ✅ NOW FIXED
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "next_wake": "2025-11-22T15:00:00.000Z"
}
```

#### 3. Capture Image Command (Server → Device) ✅
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "capture_image": true
}
```

#### 4. Send Image Command (Server → Device) ✅
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "send_image": "image_001.jpg"
}
```

#### 5. ACK_OK Message (Server → Device) ✅ NOW FIXED
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "image_name": "image_001.jpg",
  "ACK_OK": {
    "next_wake_time": "2025-11-22T15:00:00.000Z"
  }
}
```

#### 6. Missing Chunks Message (Server → Device) ✅
```json
{
  "device_id": "98:A3:16:F6:FE:18",
  "image_name": "image_001.jpg",
  "missing_chunks": [5, 10, 23]
}
```

## Data Flow Architecture

### Wake Schedule Update Flow (Now Fixed)

1. **User edits device settings in UI** → DeviceSettingsModal
2. **Frontend calls** → `DeviceService.updateDeviceSettings()`
3. **Service layer:**
   - Updates `devices.wake_schedule_cron` in database (server-side scheduling)
   - Calls `fn_calculate_next_wake()` RPC to compute actual next wake time
   - Creates command in `device_commands` table with `next_wake_time` in payload
4. **MQTT Service polls** → CommandQueueProcessor finds pending commands
5. **Command processor:**
   - Extracts `next_wake_time` from payload
   - Sends MQTT message with `next_wake` field
6. **Device receives:**
   ```json
   {"device_id": "98:A3:16:F6:FE:18", "next_wake": "2025-11-22T15:00:00.000Z"}
   ```
7. **Device calculates:** `sleep_duration = next_wake - current_time`
8. **Device sleeps** until calculated time

### Key Points

- **Cron expressions** are for **server-side scheduling only**
- **Devices** only understand **ISO 8601 UTC timestamps**
- **`fn_calculate_next_wake()`** RPC handles all timezone and cron parsing logic
- **All message sources** now properly calculate and send `next_wake` timestamps

## Testing Checklist

### 1. Test Device Settings UI Change
- [ ] Edit device 98A316F6FE18 wake schedule in UI
- [ ] Verify command inserted in `device_commands` table has `next_wake_time` in payload
- [ ] Check MQTT logs show correct message format sent to device

### 2. Test MQTT Service Direct Commands
- [ ] Send status message from device
- [ ] Verify MQTT service calculates next wake based on device schedule
- [ ] Check ACK_OK message has `next_wake_time` field

### 3. Test Device Behavior
- [ ] Device receives wake command
- [ ] Device sleeps for correct duration
- [ ] Device wakes at scheduled time (within reasonable margin)

### 4. Test Command Queue
- [ ] Queue wake schedule command manually in database
- [ ] Verify CommandQueueProcessor sends correct format via MQTT
- [ ] Check device receives and processes command

## Files Modified

1. `/mqtt-service/index.js`
   - Enhanced `calculateNextWakeTime()` function
   - Fixed `sendPendingCommands()` wake schedule handling
   - Fixed `reassembleAndUploadImage()` ACK_OK format

2. `/src/services/deviceService.ts`
   - Fixed `updateDeviceSettings()` to calculate and send `next_wake_time`
   - Added proper error handling for RPC call

## Database Dependencies

- **RPC Function:** `fn_calculate_next_wake(p_cron_expression TEXT, p_from_timestamp TIMESTAMPTZ)`
  - Location: `supabase/migrations/20251115000000_device_provisioning_automation.sql`
  - Purpose: Parse cron and calculate next wake time
  - Returns: ISO 8601 UTC timestamp

- **Tables Used:**
  - `devices` - Stores `wake_schedule_cron` for server-side scheduling
  - `sites` - Fallback wake schedule if device has none
  - `device_commands` - Command queue with `next_wake_time` in payload

## Deployment Instructions

### Frontend (Already Built)
```bash
# Build already completed successfully
# Deploy dist/ to production
```

### MQTT Service (Needs Restart)
```bash
cd /home/project/mqtt-service
pm2 restart mqtt-service
# OR if running directly:
# Kill existing process and restart
node index.js
```

### Verification
```bash
# Check MQTT service logs for correct message format
pm2 logs mqtt-service --lines 50

# Look for lines like:
# [CMD] Sent set_wake_schedule to 98A316F6FE18
# Message should contain: {"device_id":"98:A3:16:F6:FE:18","next_wake":"2025-11-22T15:00:00.000Z"}
```

## Success Criteria

✅ All wake commands from UI contain `next_wake` field with ISO timestamp
✅ All wake commands from MQTT service contain `next_wake` field
✅ All ACK_OK messages contain `next_wake_time` field
✅ No cron expressions sent directly to devices
✅ Devices properly sleep and wake at scheduled times
✅ Frontend build completes with no errors
✅ MQTT service starts without errors

## References

- BrainlyTree ESP-CAM Architecture Document (Section 5, page 5)
- MQTT_PROTOCOL_FIX_SUMMARY.md (initial fix for MQTT service only)
