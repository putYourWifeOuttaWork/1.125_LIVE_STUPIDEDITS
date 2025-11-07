# MQTT Device Handler Edge Function

## Overview

This Supabase Edge Function provides a complete MQTT integration for ESP32-CAM IoT devices, implementing the BrainlyTree ESP-CAM architecture protocol. It handles device communication, chunked image transmission, telemetry ingestion, and automatic submission creation.

## Architecture

The function implements the complete device-to-server workflow:

```
ESP32-CAM Device → MQTT Broker → Edge Function → Supabase Database → Web Application
```

### Key Features

- **Real-time MQTT Communication**: Persistent connection to HiveMQ Cloud broker
- **Chunked Image Transmission**: Handles large images via sequential chunk assembly
- **Retry Mechanism**: Requests and processes missing chunks automatically
- **Telemetry Ingestion**: Stores BME680 sensor data (temperature, humidity, pressure, gas)
- **Automatic Record Creation**: Creates submissions and observations from device data
- **Device Management**: Tracks device status, battery health, and wake schedules
- **Offline Recovery**: Handles pending images when devices reconnect after offline periods

## Protocol Implementation

### 1. Device Status Messages

**Topic**: `device/{device_id}/status`

**Message Format**:
```json
{
  "device_id": "esp32-cam-01",
  "status": "alive",
  "pendingImg": 3
}
```

**Handler Actions**:
- Updates device `last_seen_at` timestamp
- Marks device as active
- If `pendingImg > 0`, sends capture commands for pending images

### 2. Image Metadata Messages

**Topic**: `ESP32CAM/{device_mac}/data`

**Message Format**:
```json
{
  "device_id": "esp32-cam-01",
  "capture_timestamp": "2025-08-29T14:30:00Z",
  "image_name": "image_001.jpg",
  "image_size": 4153,
  "max_chunk_size": 128,
  "total_chunks_count": 15,
  "location": "Site A",
  "error": 0,
  "temperature": 25.5,
  "humidity": 45.2,
  "pressure": 1010.5,
  "gas_resistance": 15.3
}
```

**Handler Actions**:
- Creates `device_images` record with status "receiving"
- Inserts `device_telemetry` record with sensor data
- Initializes chunk buffer for image assembly
- Prepares to receive chunks

### 3. Image Chunk Messages

**Topic**: `ESP32CAM/{device_mac}/data`

**Message Format**:
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "chunk_id": 1,
  "max_chunk_size": 128,
  "payload": [255, 216, 255, 224, ...]
}
```

**Handler Actions**:
- Stores chunk in memory buffer
- Updates `received_chunks` count in database
- When all chunks received, triggers image reassembly
- If chunks missing, sends retry request

### 4. Missing Chunks Request (Server → Device)

**Topic**: `device/{device_id}/ack`

**Message Format**:
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "missing_chunks": [5, 10, 23]
}
```

### 5. ACK_OK Message (Server → Device)

**Topic**: `device/{device_id}/ack`

**Message Format**:
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "ACK_OK": {
    "next_wake_time": "2025-08-30T02:30:00Z"
  }
}
```

## Data Flow

### Complete Image Transmission Flow

1. **Device wakes and connects**
   - Sends status message with pending image count
   - Edge Function updates device last_seen timestamp

2. **Server requests image**
   - Sends `capture_image` command
   - Device captures image and sensor data

3. **Metadata transmission**
   - Device sends metadata with total chunk count
   - Edge Function creates database records and initializes buffer

4. **Chunk transmission**
   - Device sends chunks sequentially
   - Edge Function stores each chunk and updates progress

5. **Verification and retry**
   - Edge Function checks for missing chunks
   - Requests retransmission if needed
   - Device resends only missing chunks

6. **Image assembly and upload**
   - All chunks received and verified
   - Image assembled from chunks
   - Uploaded to Supabase Storage (`petri-images` bucket)

7. **Submission creation**
   - Automatic submission record created (linked to site)
   - Petri observation created (linked to submission)
   - Image URL, metadata, and flags set

8. **ACK and sleep**
   - ACK_OK sent with next wake time
   - Device enters deep sleep until next wake

## Database Schema Integration

### Tables Used

#### `devices`
- Stores device registry information
- Tracks MAC address, site association, battery health
- Maintains last_seen, wake schedule, firmware version

#### `device_telemetry`
- Time-series environmental sensor data
- Temperature, humidity, pressure, gas resistance
- Captured timestamp (may differ from received timestamp)

#### `device_images`
- Tracks image transmission status
- Chunk progress, upload URL, metadata
- Links to submissions and observations

#### `submissions`
- Device-generated submissions marked with flags
- `created_by_device_id`: UUID reference to device
- `is_device_generated`: Boolean flag for filtering

#### `petri_observations`
- Observation records with device metadata
- `is_device_generated`: Boolean flag
- `device_capture_metadata`: JSONB with full device context

## Deployment

### Prerequisites

1. **Database migrations applied**:
   ```bash
   # All device tables must exist
   - 20251107000001_create_devices_table.sql
   - 20251107000002_create_device_telemetry_table.sql
   - 20251107000003_create_device_images_table.sql
   - 20251107000004_create_device_commands_table.sql
   - 20251107000005_create_device_alerts_table.sql
   - 20251107000006_modify_submissions_for_devices.sql
   ```

2. **Storage bucket**:
   - `petri-images` bucket must exist
   - Public read access configured

3. **MQTT Broker Access**:
   - HiveMQ Cloud instance configured
   - Credentials available

### Deploy Function

Using the Supabase CLI:

```bash
# Deploy to Supabase
supabase functions deploy mqtt_device_handler
```

Or use the `mcp__supabase__deploy_edge_function` tool:

```typescript
// Tool parameters
{
  "functionName": "mqtt_device_handler",
  "code": "... entire index.ts content ...",
  "verify": true
}
```

### Environment Variables

All environment variables are automatically available in Supabase Edge Functions:

- `SUPABASE_URL` - Auto-configured
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-configured
- MQTT credentials are hardcoded in function (consider moving to Supabase secrets)

### Keep-Alive Strategy

Since MQTT requires persistent connections and Edge Functions are ephemeral, consider:

1. **Dedicated MQTT Service** (Recommended for production):
   - Deploy function to a long-running Deno Deploy project
   - Or use a separate Node.js service on Railway/Render/Fly.io
   - Maintains persistent MQTT connection

2. **Edge Function with Periodic Invocation**:
   - Set up cron job to invoke function every minute
   - Maintains connection during active periods
   - May disconnect during idle periods

3. **Hybrid Approach**:
   - Use Edge Function for HTTP endpoints (status, commands)
   - Use separate service for MQTT listener

## Testing

### Test with Device Simulator

You can test the function using the Python simulator:

```python
# In scripts/BrainlyTree_Python_AppV2.py
# Update MQTT_BROKER to point to HiveMQ Cloud
# Run the simulator to send test messages
python scripts/BrainlyTree_Python_AppV2.py
```

### Manual Testing

```bash
# 1. Check function is deployed and running
curl https://<project-ref>.supabase.co/functions/v1/mqtt_device_handler

# 2. Verify MQTT connection in function logs
supabase functions logs mqtt_device_handler

# 3. Send test status message via MQTT client
# Topic: device/test-device-01/status
# Payload: {"device_id": "test-device-01", "status": "alive"}

# 4. Check database for updates
# Query devices table for last_seen_at update
```

### Verification Checklist

- [ ] Function deploys without errors
- [ ] MQTT connection established (check logs)
- [ ] Device status messages update `devices.last_seen_at`
- [ ] Metadata messages create `device_images` records
- [ ] Chunk messages update `received_chunks` count
- [ ] Complete images uploaded to Storage
- [ ] Submissions and observations auto-created
- [ ] ACK messages sent to devices
- [ ] Missing chunks properly requested and retransmitted

## Monitoring

### Key Metrics to Track

1. **MQTT Connection Status**: Connected/Disconnected events
2. **Message Processing Rate**: Messages/second by topic
3. **Chunk Reassembly Success Rate**: Complete vs. failed images
4. **Database Write Latency**: Time to persist records
5. **Storage Upload Success Rate**: Successful uploads/total attempts
6. **Device Last Seen**: Offline detection threshold

### Logging

All operations are logged with prefixes:

- `[MQTT]` - MQTT connection events
- `[STATUS]` - Device status messages
- `[METADATA]` - Image metadata reception
- `[CHUNK]` - Chunk reception progress
- `[COMPLETE]` - All chunks received
- `[MISSING]` - Missing chunk requests
- `[SUCCESS]` - Image upload and record creation
- `[ACK]` - Acknowledgment messages sent
- `[ERROR]` - Error conditions

## Troubleshooting

### Common Issues

**1. MQTT Connection Fails**
```
Error: Connection refused
```
- Verify HiveMQ Cloud credentials
- Check firewall/network access to port 8883
- Confirm SSL/TLS settings

**2. Chunks Not Assembling**
```
Error: No metadata found for image_name
```
- Metadata must be received before chunks
- Check message ordering
- Verify device is sending metadata first

**3. Image Upload Fails**
```
Error: Failed to upload image
```
- Check Storage bucket exists (`petri-images`)
- Verify service role has storage write permissions
- Check image size limits

**4. No Submission Created**
```
Device not associated with a site
```
- Device must have `site_id` set in `devices` table
- Site must have valid `program_id`
- Check foreign key relationships

## Security Considerations

1. **Device Authentication**: MAC address validation against registry
2. **Topic Authorization**: Devices should only publish to their own topics
3. **Rate Limiting**: Consider implementing per-device rate limits
4. **Data Validation**: All incoming payloads validated before processing
5. **RLS Policies**: All database operations respect Row Level Security

## Future Enhancements

- [ ] Add device command queue processing
- [ ] Implement wake schedule cron evaluation
- [ ] Add battery health alerting thresholds
- [ ] Create device health monitoring dashboard
- [ ] Add support for firmware OTA updates
- [ ] Implement device-to-device communication
- [ ] Add image quality validation before creating observations
- [ ] Support multiple observation types (gasifier, etc.)

## References

- **Architecture Document**: `docs/IOT_DEVICE_ARCHITECTURE.md`
- **Protocol Specification**: `docs/BrainlyTree_ESP32CAM_AWS_V4.pdf`
- **Python Middleware Reference**: `scripts/BrainlyTree_Python_AppV2.py`
- **Database Schema**: `supabase/migrations/20251107*.sql`
