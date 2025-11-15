# Device Commands & Settings Guide

## Overview

Two new features have been implemented to enable real-time device communication and configuration:

1. **Test Connection (Ping)** - Sends an MQTT ping command to test device connectivity
2. **Device Settings** - Update device configuration that gets sent as commands at next wake

## How It Works

### Architecture

```
User Action → Database Command Queue → MQTT Service → Device (at next wake)
```

When a device wakes up:
1. Device sends `status` message to MQTT broker
2. MQTT service receives status and queries `device_commands` table
3. All pending commands are sent to the device via MQTT
4. Device processes commands and responds

### Command Flow (Per PDF Protocol)

**Device Wake Sequence:**
```
Device: device/{device_id}/status → {"device_id": "...", "status": "alive"}
Server: Checks device_commands table for pending commands
Server: device/{device_id}/cmd → {"device_id": "...", "ping": true}
Server: device/{device_id}/cmd → {"device_id": "...", "set_wake_schedule": "0 8,16 * * *"}
Device: Processes commands and sends responses
```

## Features

### 1. Test Connection (Ping)

**Location:** Device Detail Page → "Test Connection" button (in Device Setup Wizard review step)

**What it does:**
- Inserts a `ping` command into `device_commands` table with `status='pending'`
- Command will be sent to device at its next wake
- Device receives ping and can respond with acknowledgment

**User Feedback:**
- If device was seen < 5 min ago: "Ping command sent! Device is online and will respond shortly."
- If device was seen > 5 min ago: "Ping command queued. Device will respond at next wake (last seen X min ago)."
- If device never connected: "Ping command queued. Device has never connected - waiting for first connection."

**Database:**
```sql
INSERT INTO device_commands (
  device_id,
  command_type,
  command_payload,
  status,
  created_by_user_id
) VALUES (
  '{device_id}',
  'ping',
  '{"timestamp": "2025-11-15T10:30:00Z"}',
  'pending',
  '{user_id}'
);
```

**MQTT Message Sent:**
```json
{
  "device_id": "DEVICE-ESP32S3-002",
  "ping": true,
  "timestamp": "2025-11-15T10:30:00Z"
}
```

---

### 2. Device Settings

**Location:** Device Detail Page → "Settings" button (next to Edit button)

**What it does:**
- Opens modal to update device configuration
- Changes to wake schedule queue a `set_wake_schedule` command
- Command sent to device at next wake to update its schedule

**Configurable Settings:**
- **Device Name**: Friendly name (updates immediately in database)
- **Wake Schedule**: Cron expression for wake times (queues command)
- **Notes**: Device notes (updates immediately in database)

**Wake Schedule Options:**
- Twice Daily (8am & 4pm): `0 8,16 * * *`
- Three Times Daily (8am, 2pm & 8pm): `0 8,14,20 * * *`
- Once Daily (8am): `0 8 * * *`
- Every 6 Hours: `0 */6 * * *`
- Business Hours Only (9am-5pm, hourly): `0 9-17 * * *`
- Custom: User-defined cron expression

**Database:**
```sql
-- Update device record
UPDATE devices
SET device_name = 'Greenhouse #1 - Camera 1',
    wake_schedule_cron = '0 8,16 * * *',
    notes = 'Updated via UI'
WHERE device_id = '{device_id}';

-- Queue command for device
INSERT INTO device_commands (
  device_id,
  command_type,
  command_payload,
  status,
  created_by_user_id,
  notes
) VALUES (
  '{device_id}',
  'set_wake_schedule',
  '{"wake_schedule_cron": "0 8,16 * * *"}',
  'pending',
  '{user_id}',
  'Wake schedule updated via UI'
);
```

**MQTT Message Sent:**
```json
{
  "device_id": "DEVICE-ESP32S3-002",
  "set_wake_schedule": "0 8,16 * * *"
}
```

---

## MQTT Service Implementation

### Command Processing

Located in: `mqtt-service/index.js`

```javascript
async function sendPendingCommands(device, client) {
  // Query pending commands
  const { data: commands } = await supabase
    .from('device_commands')
    .select('*')
    .eq('device_id', device.device_id)
    .eq('status', 'pending')
    .order('issued_at', { ascending: true })
    .limit(5); // Max 5 commands per wake

  for (const command of commands) {
    // Build MQTT message based on command type
    let message = {};

    switch (command.command_type) {
      case 'ping':
        message = {
          device_id: device.device_code,
          ping: true,
          timestamp: command.command_payload?.timestamp
        };
        break;

      case 'set_wake_schedule':
        message = {
          device_id: device.device_code,
          set_wake_schedule: command.command_payload?.wake_schedule_cron
        };
        break;

      // ... other command types
    }

    // Publish to device
    client.publish(`device/${device.device_code}/cmd`, JSON.stringify(message));

    // Update command status
    await supabase
      .from('device_commands')
      .update({
        status: 'sent',
        delivered_at: new Date().toISOString()
      })
      .eq('command_id', command.command_id);
  }
}
```

### When Commands Are Sent

Commands are sent automatically when:
1. Device sends `status` message (device wake)
2. MQTT service calls `sendPendingCommands()` after updating `last_seen_at`
3. Up to 5 commands are sent per wake cycle

---

## Device Firmware Requirements

For these features to work, the device firmware must:

### 1. Listen on `device/{device_id}/cmd` topic

### 2. Handle Command Messages

**Ping Command:**
```json
{
  "device_id": "DEVICE-ESP32S3-002",
  "ping": true,
  "timestamp": "2025-11-15T10:30:00Z"
}
```

**Expected Response:**
- Device can log ping receipt
- Optionally publish acknowledgment to `device/{device_id}/ack`

**Set Wake Schedule Command:**
```json
{
  "device_id": "DEVICE-ESP32S3-002",
  "set_wake_schedule": "0 8,16 * * *"
}
```

**Expected Behavior:**
- Parse cron expression
- Update RTC wake timer
- Store new schedule in device memory/SD card
- Apply on next sleep cycle

### 3. Command Acknowledgment (Optional)

Device can send ACK to topic `device/{device_id}/ack`:

```json
{
  "device_id": "DEVICE-ESP32S3-002",
  "command_ack": {
    "type": "set_wake_schedule",
    "status": "success",
    "message": "Wake schedule updated to 0 8,16 * * *"
  }
}
```

---

## Testing

### Test Ping Command

1. Go to Device Detail Page
2. Click "Test Connection" button
3. Check MQTT service logs:
   ```
   [STATUS] Device DEVICE-ESP32S3-002 is alive
   [CMD] Found 1 pending commands for DEVICE-ESP32S3-002
   [CMD] Sent ping to DEVICE-ESP32S3-002 on device/DEVICE-ESP32S3-002/cmd
   ```

4. Check `device_commands` table:
   ```sql
   SELECT * FROM device_commands
   WHERE device_id = '{device_id}'
   AND command_type = 'ping';
   ```
   Status should change from `pending` → `sent`

### Test Settings Update

1. Go to Device Detail Page → Click "Settings"
2. Change wake schedule to "Three Times Daily"
3. Click "Save Settings"
4. Check `device_commands` table for new `set_wake_schedule` command
5. Wait for device to wake up
6. Check MQTT logs for command being sent
7. Verify device receives command and updates schedule

---

## Command Lifecycle

```
1. User Action (UI)
   ↓
2. Insert into device_commands (status='pending')
   ↓
3. Device wakes up, sends status message
   ↓
4. MQTT service queries pending commands
   ↓
5. MQTT service publishes commands to device/{id}/cmd
   ↓
6. Update command status to 'sent', set delivered_at
   ↓
7. Device receives and processes command
   ↓
8. (Optional) Device sends ACK
   ↓
9. Update command status to 'acknowledged', set acknowledged_at
```

---

## Database Schema

### device_commands Table

```sql
CREATE TABLE device_commands (
  command_id UUID PRIMARY KEY,
  device_id UUID REFERENCES devices(device_id),
  command_type TEXT CHECK (command_type IN (
    'capture_image',
    'send_image',
    'set_wake_schedule',
    'update_config',
    'reboot',
    'update_firmware',
    'ping'  -- NEW
  )),
  command_payload JSONB,
  issued_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',
    'sent',
    'acknowledged',
    'failed',
    'expired'
  )),
  retry_count INTEGER DEFAULT 0,
  created_by_user_id UUID REFERENCES users(id),
  notes TEXT
);
```

### Indexes

- `idx_device_commands_device` - Device-specific queries
- `idx_device_commands_status` - Filter by status
- `idx_device_commands_device_status` - Combined queries

---

## Security

### Row Level Security (RLS)

**Users can view commands:**
- For devices in their accessible programs/sites

**Users can create ping commands:**
- For devices they have access to
- Only for `command_type='ping'`

**Company admins can:**
- Create any command type
- Update command statuses
- Issue configuration changes

---

## Monitoring

### Check Pending Commands

```sql
SELECT
  dc.command_id,
  d.device_code,
  dc.command_type,
  dc.command_payload,
  dc.status,
  dc.issued_at,
  dc.delivered_at,
  EXTRACT(EPOCH FROM (now() - dc.issued_at))/60 as pending_minutes
FROM device_commands dc
JOIN devices d ON d.device_id = dc.device_id
WHERE dc.status = 'pending'
ORDER BY dc.issued_at DESC;
```

### Check Command Success Rate

```sql
SELECT
  command_type,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'sent' OR status = 'acknowledged' THEN 1 ELSE 0 END) as successful,
  ROUND(
    SUM(CASE WHEN status = 'sent' OR status = 'acknowledged' THEN 1 ELSE 0 END)::numeric /
    COUNT(*)::numeric * 100,
    2
  ) as success_rate_pct
FROM device_commands
GROUP BY command_type;
```

### Check Recent Activity

```sql
SELECT
  d.device_code,
  dc.command_type,
  dc.status,
  dc.issued_at,
  dc.delivered_at,
  dc.acknowledged_at
FROM device_commands dc
JOIN devices d ON d.device_id = dc.device_id
ORDER BY dc.issued_at DESC
LIMIT 20;
```

---

## Next Steps

1. **Apply Migration**: Run the ping command migration
   ```sql
   -- File: supabase/migrations/20251115000000_add_ping_command.sql
   ```

2. **Update Firmware**: Ensure device firmware listens on `cmd` topic and handles:
   - `ping` messages
   - `set_wake_schedule` messages

3. **Test End-to-End**:
   - Send ping command
   - Update wake schedule
   - Verify device receives and processes commands

4. **Monitor**: Watch MQTT logs and database for command flow

---

## Troubleshooting

### Commands Not Being Sent

**Check:**
1. MQTT service is running
2. Device is waking up and sending status messages
3. Commands exist in `device_commands` with `status='pending'`
4. Device firmware is subscribed to `device/{id}/cmd` topic

**Debug:**
```bash
# Check MQTT service logs
tail -f mqtt-service/mqtt-service.log | grep CMD

# Check database
SELECT * FROM device_commands WHERE status = 'pending';
```

### Settings Not Updating

**Check:**
1. User has permissions (company admin or device access)
2. Command was created in database
3. Device receives command at next wake
4. Device firmware processes `set_wake_schedule` correctly

**Debug:**
```sql
-- Check if command was created
SELECT * FROM device_commands
WHERE device_id = '{device_id}'
AND command_type = 'set_wake_schedule'
ORDER BY issued_at DESC LIMIT 5;

-- Check device last seen
SELECT device_code, last_seen_at, wake_schedule_cron
FROM devices
WHERE device_id = '{device_id}';
```

---

## Summary

✅ **Test Connection** now sends real MQTT ping commands to devices
✅ **Device Settings** UI allows updating wake schedules
✅ Settings changes are queued as commands and sent at device wake
✅ MQTT service automatically sends pending commands
✅ Full protocol compliance with PDF specification
