# MQTT Edge Function Deployment Guide

## Implementation Complete ✓

The MQTT Device Handler Edge Function has been successfully implemented and is ready for deployment to your Supabase project.

## What Was Built

### 1. Core MQTT Edge Function
**Location**: `supabase/functions/mqtt_device_handler/index.ts`

A complete serverless function that implements the BrainlyTree ESP32-CAM protocol including:

- ✓ Persistent MQTT connection to HiveMQ Cloud
- ✓ Device status message handling ("alive" messages with pending counts)
- ✓ Image metadata reception and device_images record creation
- ✓ Chunked image transmission with in-memory assembly
- ✓ Missing chunk detection and retry requests
- ✓ Image reassembly and upload to Supabase Storage
- ✓ Automatic submission and observation creation
- ✓ Device telemetry ingestion (BME680 sensor data)
- ✓ ACK message sending with next wake scheduling
- ✓ Device registry updates (last_seen, battery, status)

### 2. TypeScript Type Definitions
**Location**: `src/lib/types.ts` (updated)

Added comprehensive types for device data:

- `Device` - Device registry records
- `DeviceTelemetry` - Sensor readings
- `DeviceImage` - Image transmission tracking
- `DeviceCommand` - Command queue
- `DeviceAlert` - Alerting system
- `DeviceWithStats` - Extended device info with aggregates
- Enums for statuses, severities, and alert types

### 3. Documentation
**Location**: `supabase/functions/mqtt_device_handler/README.md`

Complete documentation covering:

- Architecture overview and data flow
- Protocol message formats (all 5 message types)
- Database schema integration
- Deployment instructions
- Testing procedures
- Monitoring and troubleshooting
- Security considerations

## Prerequisites Checklist

Before deploying, ensure these are complete:

### ✓ Database Migrations Applied

The following migrations should already be applied (created November 7, 2025):

```sql
20251107000001_create_devices_table.sql
20251107000002_create_device_telemetry_table.sql
20251107000003_create_device_images_table.sql
20251107000004_create_device_commands_table.sql
20251107000005_create_device_alerts_table.sql
20251107000006_modify_submissions_for_devices.sql
20251107000007_modify_petri_observations_for_devices.sql
20251107000008_modify_gasifier_observations_for_devices.sql
```

Verify in Supabase Dashboard → SQL Editor:

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE 'device%';
```

Expected result: 5 tables (devices, device_telemetry, device_images, device_commands, device_alerts)

### ✓ Storage Bucket Configured

Verify `petri-images` bucket exists and has proper access:

```sql
-- Check bucket exists
SELECT id, name, public
FROM storage.buckets
WHERE name = 'petri-images';
```

If not public, make it public in Dashboard → Storage → petri-images → Settings → Public access

### ✓ MQTT Broker Credentials

HiveMQ Cloud credentials are hardcoded in the function:

- Host: `1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud`
- Port: `8883`
- Username: `BrainlyTesting`
- Password: `BrainlyTest@1234`

Verify these credentials are still valid by testing the Python middleware.

## Deployment Options

### Option 1: Deploy via Supabase Dashboard (Simplest)

1. **Navigate to Edge Functions**
   - Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/functions
   - Click "Create a new function"

2. **Configure Function**
   - Name: `mqtt_device_handler`
   - Copy contents of `supabase/functions/mqtt_device_handler/index.ts`
   - Paste into editor

3. **Deploy**
   - Click "Deploy function"
   - Wait for deployment to complete (~30 seconds)

4. **Verify Deployment**
   - Function URL: `https://jycxolmevsvrxmeinxff.supabase.co/functions/v1/mqtt_device_handler`
   - Test: `curl https://jycxolmevsvrxmeinxff.supabase.co/functions/v1/mqtt_device_handler`
   - Expected response: `{"success": true, "message": "MQTT Device Handler is running", "connected": true}`

### Option 2: Deploy via Supabase CLI (Recommended for Development)

```bash
# 1. Install Supabase CLI (if not already installed)
npm install -g supabase

# 2. Login to Supabase
supabase login

# 3. Link to project
supabase link --project-ref jycxolmevsvrxmeinxff

# 4. Deploy function
supabase functions deploy mqtt_device_handler

# 5. View logs
supabase functions logs mqtt_device_handler --tail
```

### Option 3: Use MCP Deployment Tool

Since you have the MCP Supabase tool available:

```typescript
// Use this with your MCP tool
{
  "functionName": "mqtt_device_handler",
  "entryPoint": "index.ts",
  // Copy entire contents of index.ts file
  "code": "...",
  "verify": true
}
```

## Post-Deployment Configuration

### 1. Keep Function Warm (Important!)

Edge Functions go to sleep when idle. MQTT requires persistent connections. Choose one:

#### A. Periodic HTTP Invocation (Simple)

Set up a cron job to ping the function every minute:

```bash
# Using cron (add to crontab)
* * * * * curl -X GET https://jycxolmevsvrxmeinxff.supabase.co/functions/v1/mqtt_device_handler

# Using GitHub Actions (create .github/workflows/keep-mqtt-warm.yml)
name: Keep MQTT Handler Warm
on:
  schedule:
    - cron: '* * * * *'  # Every minute
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl https://jycxolmevsvrxmeinxff.supabase.co/functions/v1/mqtt_device_handler
```

#### B. Dedicated MQTT Service (Production Recommended)

For production, deploy the MQTT listener as a long-running service:

1. **Deploy to Deno Deploy** (keeps connection persistent)
2. **Deploy to Railway/Render/Fly.io** (Node.js version)
3. **Use a separate VPS** with PM2 for process management

### 2. Register Test Device

Add a test device to the database:

```sql
INSERT INTO devices (
  device_mac,
  device_name,
  site_id,
  program_id,
  firmware_version,
  hardware_version,
  is_active,
  provisioned_at
) VALUES (
  'B8F862F9CFB8',  -- Match the MAC from your test device
  'Test ESP32-CAM Device',
  (SELECT site_id FROM sites LIMIT 1),  -- Replace with actual site_id
  (SELECT program_id FROM pilot_programs LIMIT 1),  -- Replace with actual program_id
  'v1.0.0',
  'ESP32-S3',
  true,
  now()
);
```

Get the site_id and program_id from your database:

```sql
-- List available sites
SELECT site_id, site_name, program_id
FROM sites
ORDER BY created_at DESC
LIMIT 10;

-- List available programs
SELECT program_id, program_name
FROM pilot_programs
ORDER BY created_at DESC
LIMIT 10;
```

## Testing the Deployment

### Step 1: Verify Function is Running

```bash
# Check function health
curl https://jycxolmevsvrxmeinxff.supabase.co/functions/v1/mqtt_device_handler

# Expected response:
{
  "success": true,
  "message": "MQTT Device Handler is running",
  "connected": true
}
```

### Step 2: Monitor Function Logs

```bash
# Via CLI
supabase functions logs mqtt_device_handler --tail

# Or via Dashboard
# https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/logs/edge-functions
```

Look for:
- `[MQTT] Connected to HiveMQ Cloud`
- `[MQTT] Subscribed to ESP32CAM/+/data`
- `[MQTT] Subscribed to device/+/status`

### Step 3: Test with Python Middleware

Run the provided Python test script:

```bash
cd scripts
python BrainlyTree_Python_AppV2.py
```

This simulates a device and sends test messages. Watch the Edge Function logs for:

1. `[STATUS] Device B8F862F9CFB8 is alive`
2. `[METADATA] Received for image ...`
3. `[CHUNK] Received chunk 1/15 ...`
4. `[COMPLETE] All chunks received ...`
5. `[SUCCESS] Image uploaded ...`
6. `[ACK] Sent ACK_OK with next wake ...`

### Step 4: Verify Database Records

After sending test messages, check the database:

```sql
-- Check device was updated
SELECT device_mac, last_seen_at, is_active
FROM devices
WHERE device_mac = 'B8F862F9CFB8';

-- Check telemetry was recorded
SELECT *
FROM device_telemetry
ORDER BY captured_at DESC
LIMIT 5;

-- Check image transmission
SELECT image_name, status, received_chunks, total_chunks, image_url
FROM device_images
ORDER BY created_at DESC
LIMIT 5;

-- Check submission was created
SELECT submission_id, site_id, is_device_generated, created_by_device_id
FROM submissions
WHERE is_device_generated = true
ORDER BY created_at DESC
LIMIT 5;

-- Check observation was created
SELECT observation_id, submission_id, image_url, is_device_generated
FROM petri_observations
WHERE is_device_generated = true
ORDER BY created_at DESC
LIMIT 5;
```

### Step 5: Test with Real Device

Once verified with simulator:

1. Flash firmware to ESP32-CAM device
2. Configure WiFi credentials via BLE
3. Set device MAC address in firmware
4. Verify device appears in database
5. Monitor MQTT messages and database updates
6. Check image uploads to Storage
7. Verify submissions/observations appear in web app

## Monitoring and Maintenance

### Key Metrics to Monitor

1. **MQTT Connection Uptime**
   - Log entries: `[MQTT] Connected` vs `[MQTT] Connection error`
   - Alert if connection drops frequently

2. **Message Processing Rate**
   - Count of `[STATUS]`, `[METADATA]`, `[CHUNK]` log entries
   - Alert if processing slows down

3. **Image Assembly Success Rate**
   - `device_images.status = 'complete'` vs `'failed'`
   - Target: >95% success rate

4. **Database Write Latency**
   - Time between chunk reception and database update
   - Alert if exceeds 1 second

5. **Device Last Seen Timestamps**
   - Query devices with `last_seen_at < NOW() - INTERVAL '1 hour'`
   - Alert for offline devices

### Automated Monitoring Queries

```sql
-- Devices offline for more than 1 hour
SELECT device_mac, device_name, last_seen_at
FROM devices
WHERE is_active = true
AND last_seen_at < NOW() - INTERVAL '1 hour';

-- Failed image transmissions in last 24 hours
SELECT device_id, image_name, status, error_code, created_at
FROM device_images
WHERE status = 'failed'
AND created_at > NOW() - INTERVAL '24 hours';

-- Pending images stuck in receiving state
SELECT device_id, image_name, received_chunks, total_chunks, created_at
FROM device_images
WHERE status = 'receiving'
AND created_at < NOW() - INTERVAL '30 minutes';

-- Device telemetry anomalies
SELECT device_id, captured_at, temperature, humidity
FROM device_telemetry
WHERE temperature > 50 OR temperature < -10  -- Abnormal temperatures
OR humidity > 100 OR humidity < 0  -- Invalid humidity
AND captured_at > NOW() - INTERVAL '24 hours';
```

## Troubleshooting

### Issue: MQTT Connection Fails

**Symptoms**: Logs show `[MQTT] Connection error`

**Solutions**:
1. Verify HiveMQ credentials are correct
2. Check network connectivity (port 8883 open)
3. Verify SSL/TLS configuration
4. Check HiveMQ Cloud instance is active

### Issue: Images Not Assembling

**Symptoms**: Chunks received but status stays "receiving"

**Solutions**:
1. Check all chunks are being received (compare received_chunks vs total_chunks)
2. Verify metadata was received before chunks
3. Check memory limits (large images may fail)
4. Review missing chunk requests in logs

### Issue: Submissions Not Created

**Symptoms**: Images complete but no submission records

**Solutions**:
1. Verify device has `site_id` set
2. Check site has valid `program_id`
3. Review foreign key constraints
4. Check service role permissions

### Issue: Function Goes Offline

**Symptoms**: No log entries for extended period

**Solutions**:
1. Implement keep-warm strategy (cron job)
2. Check Edge Function quota limits
3. Consider dedicated MQTT service
4. Review error logs for crashes

## Next Steps

Once deployed and tested:

1. **Build Device Management UI**
   - Device registry page
   - Device detail view with telemetry charts
   - Image transmission monitoring
   - Battery health alerts

2. **Implement Device Commands**
   - Capture on-demand
   - Firmware updates
   - Configuration changes
   - Wake schedule adjustments

3. **Add Advanced Monitoring**
   - Real-time device status dashboard
   - Telemetry visualization
   - Alert management interface
   - Device health scoring

4. **Optimize for Scale**
   - Implement connection pooling
   - Add caching for frequent queries
   - Optimize chunk buffer memory usage
   - Add rate limiting per device

## Support and Resources

- **Architecture Documentation**: `docs/IOT_DEVICE_ARCHITECTURE.md`
- **Protocol Specification**: `docs/BrainlyTree_ESP32CAM_AWS_V4.pdf`
- **Function README**: `supabase/functions/mqtt_device_handler/README.md`
- **Database Schema**: `supabase/migrations/20251107*.sql`
- **TypeScript Types**: `src/lib/types.ts`

## Summary

✓ MQTT Edge Function implemented and ready to deploy
✓ Complete protocol implementation matching BrainlyTree spec
✓ Automatic submission/observation creation
✓ Comprehensive error handling and retry logic
✓ TypeScript types added for frontend integration
✓ Documentation complete
✓ Project builds successfully

**Ready for deployment and device testing!**
