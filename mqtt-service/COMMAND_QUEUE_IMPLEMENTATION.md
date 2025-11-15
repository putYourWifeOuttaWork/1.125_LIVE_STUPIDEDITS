# MQTT Command Queue Implementation

## Overview

The MQTT Command Queue system enables bidirectional communication between the backend and ESP32-CAM devices via MQTT. Commands are queued in the database and processed by the mqtt-service, which publishes them to devices via MQTT.

## Architecture

### Components

1. **CommandQueueProcessor** (`commandQueueProcessor.js`)
   - Polls `device_commands` table for pending commands
   - Publishes commands via MQTT to devices
   - Handles acknowledgments and retry logic
   - Manages command lifecycle (pending → sent → acknowledged/failed)

2. **MQTT Service Integration** (`index.js`)
   - Initializes CommandQueueProcessor on startup
   - Listens for device provisioning events via Supabase Realtime
   - Automatically sends welcome commands to newly-mapped devices
   - Handles command acknowledgments from devices

3. **Database Table** (`device_commands`)
   - Stores commands to be sent to devices
   - Tracks command status and delivery
   - Supports retry logic with configurable limits

## Command Types

Per BrainlyTree ESP32-CAM Architecture PDF specification:

### 1. `capture_image`
Instructs device to capture an image immediately.

**Payload:**
```json
{
  "device_id": "AA:BB:CC:DD:EE:FF",
  "capture_image": true
}
```

**MQTT Topic:** `device/{MAC}/cmd`

### 2. `send_image`
Requests device to send a specific captured image.

**Payload:**
```json
{
  "device_id": "AA:BB:CC:DD:EE:FF",
  "send_image": "image_name_123"
}
```

### 3. `set_wake_schedule`
Updates device wake schedule using cron expression.

**Payload:**
```json
{
  "device_id": "AA:BB:CC:DD:EE:FF",
  "next_wake": "2025-11-15T16:00:00Z"
}
```

**Used for:**
- Welcome commands after device mapping
- Schedule changes
- Dynamic wake adjustments

### 4. `update_config`
Updates device configuration parameters.

**Payload:**
```json
{
  "device_id": "AA:BB:CC:DD:EE:FF",
  "config_param": "value"
}
```

### 5. `reboot`
Instructs device to reboot.

**Payload:**
```json
{
  "device_id": "AA:BB:CC:DD:EE:FF",
  "reboot": true
}
```

### 6. `update_firmware`
Triggers OTA firmware update.

**Payload:**
```json
{
  "device_id": "AA:BB:CC:DD:EE:FF",
  "firmware_url": "https://..."
}
```

## Command Lifecycle

### 1. Command Creation
Commands can be created by:
- Frontend UI via API calls
- Backend automation (e.g., welcome commands)
- Scheduled jobs
- Manual database inserts

**Example SQL:**
```sql
INSERT INTO device_commands (device_id, command_type, command_payload, status)
VALUES (
  'device-uuid-here',
  'capture_image',
  '{"capture_image": true}',
  'pending'
);
```

### 2. Command Processing
The CommandQueueProcessor polls every 5 seconds (configurable) and:
1. Fetches pending commands from `device_commands`
2. Builds MQTT payload per command type
3. Publishes to `device/{MAC}/cmd` topic
4. Updates status to `sent` on success
5. Updates status to `failed` on error

### 3. Device Acknowledgment
Devices send ACK messages to `device/{MAC}/ack`:
```json
{
  "device_id": "AA:BB:CC:DD:EE:FF",
  "command_ack": "acknowledged"
}
```

The service:
1. Receives ACK on subscribed topic
2. Finds most recent `sent` command for device
3. Updates status to `acknowledged`
4. Records `acknowledged_at` timestamp

### 4. Retry Logic
Failed commands are automatically retried:
- **Max Retries:** 3 (configurable)
- **Retry Delay:** 30 seconds (configurable)
- Commands exceeding max retries remain `failed`
- Commands older than 24 hours are marked `expired`

## Welcome Command Flow

When a super admin maps a device to a site:

1. **Database Trigger Fires**
   - `fn_trigger_device_lineage_update` detects device mapping
   - Calls `fn_initialize_device_after_mapping`
   - Updates device with site_id, program_id, company_id
   - Sets provisioning_status to `active`

2. **Realtime Listener Detects Change**
   - mqtt-service listens for provisioning_status = 'active'
   - Detects device transition to active state

3. **Welcome Command Sent**
   - Fetches site's wake_schedule_cron
   - Calculates next wake time using `fn_calculate_next_wake`
   - Queues welcome command via `sendWelcomeCommand()`

4. **Device Receives Welcome**
   - Device receives command on `device/{MAC}/cmd`
   - Updates internal wake schedule
   - Sends ACK to confirm receipt

## Configuration

### CommandQueueProcessor Options

```javascript
new CommandQueueProcessor(supabase, mqttClient, {
  pollInterval: 5000,   // Poll every 5 seconds
  maxRetries: 3,        // Max 3 retry attempts
  retryDelay: 30000,    // Wait 30s before retry
});
```

### Environment Variables

All required variables are already configured:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MQTT_HOST`
- `MQTT_PORT`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`

## Monitoring

### Health Endpoint
```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "healthy",
  "mqtt": {
    "connected": true,
    "host": "1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud",
    "port": 8883
  },
  "commandQueue": {
    "running": true,
    "pollInterval": 5000
  },
  "uptime": 3600
}
```

### Logs
The service logs all command processing:
```
[CommandQueue] Processing 5 pending command(s)
[CommandQueue] ✅ Sent capture_image to DEVICE-ESP32S3-001
[CommandQueue] Retrying 2 failed command(s)
[CommandQueue] ✅ Command set_wake_schedule acknowledged by device
```

## Database Queries

### View Pending Commands
```sql
SELECT
  c.command_id,
  c.command_type,
  c.status,
  c.retry_count,
  d.device_name,
  d.device_mac,
  c.issued_at
FROM device_commands c
JOIN devices d ON d.device_id = c.device_id
WHERE c.status = 'pending'
ORDER BY c.issued_at;
```

### View Recent Command History
```sql
SELECT
  c.command_type,
  c.status,
  d.device_name,
  c.issued_at,
  c.delivered_at,
  c.acknowledged_at,
  c.retry_count
FROM device_commands c
JOIN devices d ON d.device_id = c.device_id
WHERE c.issued_at > now() - interval '1 hour'
ORDER BY c.issued_at DESC;
```

### Failed Commands Needing Attention
```sql
SELECT
  c.command_id,
  c.command_type,
  d.device_name,
  c.retry_count,
  c.issued_at
FROM device_commands c
JOIN devices d ON d.device_id = c.device_id
WHERE c.status = 'failed'
  AND c.retry_count >= 3
ORDER BY c.issued_at DESC;
```

## Integration with Frontend

### Queue Command from Frontend
Use the API to queue commands:

```typescript
// Queue a capture command
const { data, error } = await supabase
  .from('device_commands')
  .insert({
    device_id: deviceId,
    command_type: 'capture_image',
    command_payload: { capture_image: true },
    status: 'pending',
  })
  .select()
  .single();
```

The mqtt-service will automatically:
1. Detect the new pending command
2. Publish it to the device
3. Update the status

### Monitor Command Status
Subscribe to command status changes:

```typescript
const subscription = supabase
  .channel('command-status')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'device_commands',
      filter: `device_id=eq.${deviceId}`,
    },
    (payload) => {
      console.log('Command status updated:', payload.new.status);
    }
  )
  .subscribe();
```

## Testing

### Manual Command Queue Test
1. Insert a test command:
```sql
INSERT INTO device_commands (device_id, command_type, command_payload, status)
VALUES (
  (SELECT device_id FROM devices WHERE device_mac = 'AA:BB:CC:DD:EE:FF'),
  'capture_image',
  '{"capture_image": true}',
  'pending'
);
```

2. Watch service logs for processing
3. Verify status updates in database

### Test Welcome Command
1. Create a new virtual device
2. Map it to a site via admin UI
3. Watch logs for welcome command
4. Verify command in `device_commands` table

## Troubleshooting

### Commands Not Being Processed
**Check:**
1. mqtt-service is running: `curl http://localhost:3000/health`
2. CommandQueueProcessor is active: Check `commandQueue.running` in health response
3. Device is active: `SELECT is_active FROM devices WHERE device_mac = '...'`

### Commands Stuck in 'sent' State
**Likely Causes:**
- Device not sending ACK
- Device offline
- MQTT connection issue

**Resolution:**
- Check device connectivity
- Verify device is subscribed to command topic
- Check MQTT broker logs

### Welcome Commands Not Sent
**Check:**
1. Realtime listener is active (check startup logs)
2. Device provisioning_status changed to 'active'
3. Device has site_id and program_id populated

## Next Steps

1. **Apply Migration**: The provisioning automation migration must be applied first:
   ```bash
   # See APPLY_PROVISIONING_MIGRATION.md for instructions
   ```

2. **Restart MQTT Service**: After migration is applied:
   ```bash
   cd mqtt-service
   npm start
   ```

3. **Test End-to-End**: Use backfill script to test complete flow:
   ```bash
   node backfill-device-lineage.mjs
   ```

## Related Documentation

- `APPLY_PROVISIONING_MIGRATION.md` - Migration application guide
- `supabase/migrations/20251115000000_device_provisioning_automation.sql` - Database functions
- `docs/IOT_DEVICE_ARCHITECTURE.md` - Overall IoT architecture
- `docs/BrainlyTree_ESP32CAM_AWS_V4.pdf` - Device firmware protocol specification
