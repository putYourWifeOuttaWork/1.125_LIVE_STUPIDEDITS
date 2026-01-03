# Manual Wake System - Complete Implementation

## Overview
The manual wake system allows users to schedule one-time device wake events without disrupting the regular wake schedule. After the manual wake completes, the device automatically resumes its normal schedule.

## Architecture

### Components
1. **Frontend UI** - `ManualWakeModal.tsx`
2. **Database Table** - `device_commands` (queue)
3. **Command Processor** - `commandQueueProcessor.js` (MQTT service)
4. **Edge Function** - `mqtt_device_handler` (processes device responses)

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. User schedules manual wake via UI                                │
│    - User clicks "Wake in 1 min" button                             │
│    - ManualWakeModal.tsx handles the request                        │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. Two database operations (atomic)                                 │
│                                                                      │
│    A. Update devices table:                                         │
│       - next_wake_at = 2026-01-03 12:01:00                         │
│       - manual_wake_override = true                                 │
│       - manual_wake_requested_by = user_id                         │
│       - manual_wake_requested_at = now()                           │
│                                                                      │
│    B. Insert into device_commands:                                  │
│       - command_type = 'set_wake_schedule'                         │
│       - command_payload = { next_wake_time, manual_wake: true }    │
│       - status = 'pending'                                          │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Command Queue Processor (polls every 5 seconds)                  │
│    - Finds pending command                                          │
│    - Converts ISO time to device format: "12:01PM"                 │
│    - Publishes to MQTT: ESP32CAM/{MAC}/cmd                         │
│    - Payload: { device_id: MAC, next_wake: "12:01PM" }            │
│    - Marks command as 'sent'                                        │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. Device receives command                                          │
│    - ESP32-CAM wakes at "12:01PM" UTC                              │
│    - Sends HELLO message to ESP32CAM/{MAC}/status                  │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. Edge Function processes HELLO                                    │
│    - Detects manual_wake_override = true                           │
│    - Clears override flags:                                         │
│      • manual_wake_override = false                                 │
│      • manual_wake_requested_by = null                             │
│      • manual_wake_requested_at = null                             │
│    - Calculates next_wake_at from regular schedule                 │
│    - Updates device record                                          │
│    - Creates wake_payload record                                    │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. Device resumes normal schedule                                   │
│    - Next wake calculated from cron schedule                        │
│    - Device continues regular operation                             │
└─────────────────────────────────────────────────────────────────────┘
```

## Code Implementation

### 1. Frontend - ManualWakeModal.tsx
```typescript
const handleQuickWake = async (minutes: number) => {
  const nextWakeTime = new Date(Date.now() + minutes * 60 * 1000);

  // Step 1: Update device record
  await supabase.from('devices').update({
    next_wake_at: nextWakeTime.toISOString(),
    manual_wake_override: true,
    manual_wake_requested_by: user.id,
    manual_wake_requested_at: now,
  }).eq('device_id', deviceId);

  // Step 2: Queue MQTT command
  await supabase.from('device_commands').insert({
    device_id: deviceId,
    command_type: 'set_wake_schedule',
    command_payload: {
      next_wake_time: nextWakeTime.toISOString(),
      manual_wake: true,
    },
    status: 'pending',
    created_by_user_id: user.id,
  });
};
```

### 2. Command Queue Processor
```javascript
// Polls every 5 seconds for pending commands
async processPendingCommands() {
  const commands = await supabase
    .from('device_commands')
    .select('*, devices(device_mac, device_name)')
    .eq('status', 'pending');

  for (const command of commands) {
    await this.publishCommand(command);
  }
}

// Converts ISO time to device format
formatTimeForDevice(isoTimestamp) {
  // "2026-01-03T12:01:00Z" -> "12:01PM"
  const date = new Date(isoTimestamp);
  let hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes.toString().padStart(2, '0')}${ampm}`;
}

// Publishes to MQTT
buildCommandPayload(command, deviceMac) {
  return {
    device_id: deviceMac,
    next_wake: this.formatTimeForDevice(command.command_payload.next_wake_time)
  };
}
```

### 3. Edge Function - handleHelloStatus
```typescript
// Check for manual wake override
const wasManualWake = existingDevice.manual_wake_override === true;

if (wasManualWake) {
  console.log('[Ingest] Manual wake override detected - clearing flag and resuming schedule');
  updateData.manual_wake_override = false;
  updateData.manual_wake_requested_by = null;
  updateData.manual_wake_requested_at = null;
}

// Calculate next wake from regular schedule
if (existingDevice.wake_schedule_cron) {
  const { data: nextWakeCalc } = await supabase.rpc(
    'fn_calculate_next_wake_time',
    {
      p_last_wake_at: now,
      p_cron_expression: existingDevice.wake_schedule_cron,
      p_timezone: deviceTimezone
    }
  );

  if (nextWakeCalc) {
    updateData.next_wake_at = nextWakeCalc;
    console.log(
      wasManualWake ? '[Ingest] Resuming scheduled wake:' : '[Ingest] Next wake calculated:',
      nextWakeCalc
    );
  }
}
```

## Database Schema

### devices table
```sql
ALTER TABLE devices
ADD COLUMN manual_wake_override BOOLEAN DEFAULT FALSE,
ADD COLUMN manual_wake_requested_by UUID REFERENCES auth.users(id),
ADD COLUMN manual_wake_requested_at TIMESTAMPTZ;
```

### device_commands table
Already exists with columns:
- `command_id` (uuid, primary key)
- `device_id` (uuid, foreign key)
- `command_type` (text)
- `command_payload` (jsonb)
- `status` (text: pending, sent, acknowledged, failed, expired)
- `created_by_user_id` (uuid)
- `issued_at` (timestamptz)
- `delivered_at` (timestamptz)
- `acknowledged_at` (timestamptz)
- `retry_count` (integer)

## Testing

### Manual Wake Test Scenario
```bash
# 1. Device has regular schedule: Wake every day at 6:00 AM
# Current time: 2:30 PM
# Current next_wake_at: Tomorrow at 6:00 AM

# 2. User schedules manual wake: "Wake in 1 min"
# Result:
#   - next_wake_at = 2:31 PM (today)
#   - manual_wake_override = true
#   - Command queued for MQTT

# 3. Device wakes at 2:31 PM
# Result:
#   - manual_wake_override = false (cleared)
#   - next_wake_at = Tomorrow at 6:00 AM (regular schedule resumes)

# 4. Device continues normal operation
# Next wake: Tomorrow at 6:00 AM (as originally scheduled)
```

## Error Handling

### Command Fails to Queue
- Device record is still updated
- User sees warning toast
- Device will wake at scheduled time anyway (via next_wake_at)

### MQTT Service Offline
- Command remains in 'pending' state
- Will be processed when service comes back online
- Commands expire after 24 hours

### Device Offline
- Command is sent but device doesn't wake
- Device will wake when it reconnects and checks next_wake_at
- Command marked as 'expired' after 24 hours

## Monitoring

### Check Command Status
```sql
SELECT
  dc.command_id,
  dc.command_type,
  dc.status,
  dc.issued_at,
  dc.delivered_at,
  dc.retry_count,
  d.device_name,
  d.device_mac
FROM device_commands dc
JOIN devices d ON dc.device_id = d.device_id
WHERE dc.command_type = 'set_wake_schedule'
  AND dc.status IN ('pending', 'sent')
ORDER BY dc.issued_at DESC;
```

### Check Manual Wake Overrides
```sql
SELECT
  device_id,
  device_name,
  next_wake_at,
  manual_wake_override,
  manual_wake_requested_by,
  manual_wake_requested_at
FROM devices
WHERE manual_wake_override = true;
```

## Benefits

1. **Non-Disruptive Testing**: Test devices without affecting their regular schedule
2. **Audit Trail**: Track who requested manual wakes and when
3. **Automatic Resume**: No manual intervention needed to restore regular schedule
4. **Reliable Delivery**: Command queue with retry logic ensures delivery
5. **Real-time Updates**: Device receives immediate notification via MQTT

## Future Enhancements

1. **Batch Manual Wake**: Wake multiple devices simultaneously
2. **Manual Wake History**: UI to view past manual wake requests
3. **Custom Wake Payloads**: Include custom data with manual wakes
4. **Wake Confirmation**: UI feedback when device acknowledges command
