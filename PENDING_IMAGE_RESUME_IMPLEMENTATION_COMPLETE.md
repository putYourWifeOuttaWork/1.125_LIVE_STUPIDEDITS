# Pending Image Resume Protocol - Implementation Complete

## Overview

The system now handles cases where devices report pending images (incomplete transfers from previous wake cycles) by querying the database and sending appropriate commands based on what it finds.

## Implementation Summary

### What Changed

**Local MQTT Service (`mqtt-service/index.js`)**

1. **Added `publishPendingImageAck()` Function** (Lines 140-194)
   - Builds ACK message per protocol: `{"device_id": "{MAC}", "image_name": "{image_name}", "ACK_OK": {}}`
   - Publishes to `ESP32CAM/{MAC}/ack` topic
   - Logs ACK to `device_ack_log` table for audit trail
   - Updates image status to 'receiving' to resume transfer

2. **Updated `handleStatusMessage()` Function** (Lines 280-334)
   - **Query Phase**: When device reports `pendingImg > 0`, queries database for incomplete images:
     ```javascript
     const { data: pendingImage } = await supabase
       .from('device_images')
       .select('*')
       .eq('device_id', device.device_id)
       .in('status', ['pending', 'receiving'])
       .order('captured_at', { ascending: true })
       .limit(1)
       .maybeSingle();
     ```
   - **Conditional Command Logic**:
     - Device reports `pendingImg > 0` AND image found in DB → Send ACK to resume
     - Device reports `pendingImg > 0` BUT no image in DB → Send `capture_image` (fallback)
     - Device reports `pendingImg = 0` → Send `capture_image` (normal flow)

3. **Improved Console Logging**
   - `[ACK] Resuming pending image {image_name} for device {MAC}`
   - `[CMD] Device reports {N} pending but none in DB - sending capture_image as fallback`
   - `[CMD] No pending images - sending capture_image for new capture`
   - `[STATUS] Found pending image {image_name} in DB for resume ({received}/{total} chunks)`

### Protocol Flow

#### Scenario A: Device with Pending Images Found in Database

```
Device → Server: HELLO {"device_id": "98A316F82928", "pendingImg": 2}
Server: Queries database for pending images
Server: Finds image_11802.jpg (status: 'receiving', 12/25 chunks)
Server → Device: ACK {"device_id": "98A316F82928", "image_name": "image_11802.jpg", "ACK_OK": {}}
Device → Server: Resumes sending remaining chunks for image_11802.jpg
```

**Expected Logs:**
```
[STATUS] Device reports 2 pending images - checking database...
[STATUS] Found pending image image_11802.jpg in DB for resume (12/25 chunks)
[ACK] Resuming pending image image_11802.jpg for device 98A316F82928
[ACK] Sent resume ACK for image_11802.jpg to 98A316F82928 on ESP32CAM/98A316F82928/ack
[ACK] Logged resume ACK to database for image_11802.jpg
```

#### Scenario B: Device Reports Pending But None in Database

```
Device → Server: HELLO {"device_id": "98A316F82928", "pendingImg": 1}
Server: Queries database for pending images
Server: No pending images found in database
Server → Device: CMD {"device_id": "98A316F82928", "capture_image": true}
Device → Server: Captures new image and sends metadata
```

**Expected Logs:**
```
[STATUS] Device reports 1 pending images - checking database...
[STATUS] Device reports 1 pending but none found in DB - will send capture_image as fallback
[CMD] Device reports 1 pending but none in DB - sending capture_image as fallback
```

#### Scenario C: Device with No Pending Images

```
Device → Server: HELLO {"device_id": "98A316F82928", "pendingImg": 0}
Server: Skips database query (no pending reported)
Server → Device: CMD {"device_id": "98A316F82928", "capture_image": true}
Device → Server: Captures new image and sends metadata
```

**Expected Logs:**
```
[STATUS] Device has no pending images - will capture new image
[CMD] No pending images - sending capture_image for new capture
```

### Database Tables Used

1. **`device_images`** - Query for pending images
   - Filters: `device_id`, `status IN ('pending', 'receiving')`
   - Ordered by: `captured_at ASC` (oldest first)
   - Returns: First incomplete image found

2. **`device_ack_log`** - Log all ACK messages sent
   - Fields: `device_id`, `mac_address`, `image_name`, `ack_type`, `ack_sent_at`, `message_payload`
   - Purpose: Complete audit trail of all device communications

3. **`device_wake_payloads`** - Track wake events (handled by edge function)
   - Updated with `protocol_state` as images progress

## Testing Guide

### Test Case 1: Resume Pending Image

**Setup:**
1. Find or create a device with incomplete image transfer
2. Ensure `device_images` has record with `status = 'receiving'` or `'pending'`
3. Note the `image_name` and chunk count

**Simulate Device Wake:**
```bash
# Publish HELLO message with pendingImg > 0
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 -u BrainlyTesting -P 'BrainlyTest@1234' \
  --capath /etc/ssl/certs/ \
  -t "ESP32CAM/98A316F82928/status" \
  -m '{"device_id":"98A316F82928","device_mac":"98:A3:16:F8:29:28","pendingImg":2,"battery_voltage":3.95,"wifi_rssi":-45}'
```

**Expected Result:**
- Server logs show database query
- Server logs show pending image found
- ACK message sent to device with `image_name`
- `device_ack_log` table has new entry with `ack_type = 'resume_pending'`
- Device receives ACK and resumes chunk transmission

### Test Case 2: Pending Reported But Not in Database

**Setup:**
1. Find device with NO incomplete images in database
2. Device will report pendingImg > 0 (simulated)

**Simulate Device Wake:**
```bash
# Publish HELLO with pendingImg but no matching DB record
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 -u BrainlyTesting -P 'BrainlyTest@1234' \
  --capath /etc/ssl/certs/ \
  -t "ESP32CAM/AABBCCDDEEFF/status" \
  -m '{"device_id":"AABBCCDDEEFF","device_mac":"AA:BB:CC:DD:EE:FF","pendingImg":1,"battery_voltage":3.80,"wifi_rssi":-55}'
```

**Expected Result:**
- Server logs show database query
- Server logs show "Device reports 1 pending but none found in DB"
- `capture_image` command sent (fallback to normal protocol)
- Device captures NEW image instead of trying to resume

### Test Case 3: Normal Flow (No Pending)

**Setup:**
1. Any active device

**Simulate Device Wake:**
```bash
# Publish HELLO with pendingImg = 0
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 -u BrainlyTesting -P 'BrainlyTest@1234' \
  --capath /etc/ssl/certs/ \
  -t "ESP32CAM/98A316F82928/status" \
  -m '{"device_id":"98A316F82928","device_mac":"98:A3:16:F8:29:28","pendingImg":0,"battery_voltage":4.05,"wifi_rssi":-40}'
```

**Expected Result:**
- Server skips database query (no pending reported)
- Server logs show "Device has no pending images - will capture new image"
- `capture_image` command sent
- Normal protocol flow continues

## SQL Queries for Verification

### Check for Pending Images
```sql
-- Find devices with pending/incomplete images
SELECT
  d.device_code,
  d.device_mac,
  di.image_name,
  di.status,
  di.received_chunks,
  di.total_chunks,
  di.captured_at,
  di.updated_at
FROM device_images di
JOIN devices d ON d.device_id = di.device_id
WHERE di.status IN ('pending', 'receiving')
ORDER BY di.captured_at ASC;
```

### Check ACK Log
```sql
-- View recent ACK messages sent
SELECT
  dal.ack_sent_at,
  d.device_code,
  dal.mac_address,
  dal.image_name,
  dal.ack_type,
  dal.message_payload
FROM device_ack_log dal
JOIN devices d ON d.device_id = dal.device_id
ORDER BY dal.ack_sent_at DESC
LIMIT 20;
```

### Create Test Pending Image
```sql
-- Create a pending image record for testing
INSERT INTO device_images (
  device_id,
  image_name,
  image_size,
  captured_at,
  total_chunks,
  received_chunks,
  status,
  metadata
)
SELECT
  device_id,
  'test_image_' || extract(epoch from now()) || '.jpg',
  204800,
  now() - interval '5 minutes',
  25,
  12,
  'receiving',
  '{"test": true}'::jsonb
FROM devices
WHERE device_mac = '98A316F82928'
LIMIT 1;
```

## Monitoring and Diagnostics

### View Service Logs
```bash
# If running in Docker
docker logs mqtt-service -f --tail 100

# If running directly
tail -f /var/log/mqtt-service.log

# Look for these patterns:
# [STATUS] Device reports N pending images - checking database...
# [STATUS] Found pending image X in DB for resume
# [ACK] Resuming pending image X for device Y
# [ACK] Logged resume ACK to database
```

### Database Audit Trail
```sql
-- Complete device communication audit
SELECT
  wp.captured_at,
  d.device_code,
  wp.wake_type,
  wp.protocol_state,
  wp.server_image_name,
  di.status as image_status,
  di.received_chunks || '/' || di.total_chunks as chunks,
  dal.ack_type,
  dal.ack_sent_at
FROM device_wake_payloads wp
JOIN devices d ON d.device_id = wp.device_id
LEFT JOIN device_images di ON di.server_image_name = wp.server_image_name
LEFT JOIN device_ack_log dal ON dal.image_name = di.image_name
WHERE d.device_mac = '98A316F82928'
ORDER BY wp.captured_at DESC
LIMIT 20;
```

## Key Design Decisions

### 1. Query Database Before Sending Commands
- **Rationale**: Devices may report pending images that no longer exist in DB (cleanup, timeout, etc.)
- **Benefit**: Server has single source of truth (database) rather than trusting device count

### 2. Oldest Image First
- **Rationale**: `ORDER BY captured_at ASC` ensures FIFO processing
- **Benefit**: Prevents indefinite delay of old incomplete images

### 3. Fallback to capture_image
- **Rationale**: If device reports pending but DB has none, default to normal protocol
- **Benefit**: System self-heals from inconsistent state

### 4. Log Everything to Database
- **Rationale**: Track all ACKs, commands, and state transitions
- **Benefit**: Complete audit trail for debugging and analytics

### 5. Status Update on Resume
- **Rationale**: Change status from 'pending' to 'receiving' when resume ACK sent
- **Benefit**: Clear indication that transfer has been initiated

## No Stale Image Auto-Cleanup (Yet)

Per requirements, there is NO automatic cleanup of stale pending images based on age. The "Clear Stale Images" button on the device record will handle manual cleanup when needed.

**Future Enhancement**: Could add optional auto-cleanup with configurable age threshold:
```javascript
// NOT IMPLEMENTED - for future consideration
const MAX_PENDING_IMAGE_AGE_HOURS = 72; // 3 days
const staleThreshold = new Date(Date.now() - MAX_PENDING_IMAGE_AGE_HOURS * 60 * 60 * 1000);
```

## Edge Function Coordination

The Edge Function (`mqtt_device_handler`) continues to handle:
- Database logging of all MQTT messages
- Creating wake_payload records
- Updating device telemetry
- State machine tracking

The Local MQTT Service handles:
- Actual MQTT command publishing to devices
- Protocol decision logic
- Direct device communication

**No Conflicts**: Each system has clear responsibilities. Edge function provides audit trail, local service provides real-time device communication.

## Restart Required

After deploying these changes, restart the local MQTT service:

```bash
# If using systemd
sudo systemctl restart mqtt-service

# If using Docker
docker restart mqtt-service

# If running directly
pkill -f "node mqtt-service/index.js"
node mqtt-service/index.js
```

## Success Criteria

✅ Device with pending images receives ACK to resume
✅ Device without pending images in DB falls back to capture_image
✅ All ACKs are logged to device_ack_log table
✅ Console logs clearly indicate which path was taken
✅ No data loss when devices have incomplete transfers
✅ System automatically resumes incomplete transfers on next wake

## Related Documentation

- `mqtt-service/README.md` - MQTT service architecture
- `docs/IOT_DEVICE_ARCHITECTURE.md` - Complete IoT device system
- `ESP32_MQTT_PROTOCOL_COMPLETE_GUIDE.md` - MQTT protocol specification
- `MQTT_PROTOCOL_COMPLIANCE_COMPLETE_FIX.md` - Protocol compliance details

---

**Status**: ✅ Implementation Complete
**Date**: 2026-01-14
**Version**: 1.0
