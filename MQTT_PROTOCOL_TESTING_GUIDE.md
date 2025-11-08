# 🧪 MQTT Protocol Testing Guide

**Complete testing suite for BrainlyTree ESP32-CAM MQTT protocol implementation**

---

## 📋 Overview

This guide provides comprehensive testing procedures for validating the MQTT protocol implementation, including:

- ✅ Device status messages (alive/heartbeat)
- ✅ Image metadata transmission
- ✅ Chunked image upload with configurable chunk sizes
- ✅ Missing chunk detection and retry mechanism
- ✅ Offline recovery with pending image queue
- ✅ Environmental sensor data (BME680)
- ✅ Wake session tracking
- ✅ Device history logging
- ✅ Automatic submission and observation creation

---

## 🛠️ Prerequisites

### 1. MQTT Service Running

**Option A: Node.js MQTT Service (Recommended for Local Testing)**

```bash
cd mqtt-service
npm install
npm start
```

Expected output:
```
[MQTT] ✅ Connected to HiveMQ Cloud
[MQTT] ✅ Subscribed to ESP32CAM/+/data
[MQTT] ✅ Subscribed to device/+/status
[HTTP] ✅ Health check server running on port 3000
```

**Option B: Supabase Edge Function (Production)**

```bash
# Deploy the edge function
supabase functions deploy mqtt_device_handler

# Keep it warm with periodic requests
curl https://your-project.supabase.co/functions/v1/mqtt_device_handler
```

### 2. Python Environment

```bash
# Install required packages
pip install paho-mqtt python-dotenv

# Verify installation
python3 -c "import paho.mqtt.client; print('MQTT client ready')"
```

### 3. Database Ready

Verify all device tables exist:

```bash
node verify-schema-complete.mjs
```

Expected: 22/22 checks passing

### 4. Test Device Registered (Optional)

The simulator will auto-provision new devices, but you can pre-register:

```bash
node test-new-device-provisioning.mjs
```

---

## 🎯 Testing Scenarios

### Test 1: Normal Operation Flow

**What it tests:**
- Device status message transmission
- Complete image upload without errors
- Metadata and telemetry recording
- Chunk transmission and assembly
- ACK_OK reception with next wake schedule

**Run the test:**

```bash
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-001 --test normal
```

**Expected output:**

```
==================================================================
TEST CASE 1: Normal Operation
==================================================================
[DEVICE] Initialized mock device: TEST-ESP32-001
[MQTT] Connecting to 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud:8883...
[MQTT] ✅ Connected successfully

[STATUS] Sending alive message (pending: 0)
[STATUS] Published to device/TEST-ESP32-001/status

[CAPTURE] Simulating image capture: image_1699564321000.jpg
[CAPTURE] Generated mock image: 45672 bytes

[METADATA] Sending metadata:
  - Image: image_1699564321000.jpg
  - Size: 45672 bytes
  - Chunks: 6
  - Chunk size: 8192 bytes
  - Temp: 73.2°F, Humidity: 46.8%

[CHUNKS] Sending 6 chunks...
[CHUNKS] Sent 5/6 chunks (83.3%)
[CHUNKS] ✅ All chunks sent

[ACK] ✅ Image transmission successful!
[ACK] Next wake scheduled: 2025-11-08T23:30:00.000Z

✅ TEST PASSED: Normal operation successful
```

**Validate results:**

```bash
node validate-mqtt-protocol.mjs --mac=TEST-ESP32-001 --since=5
```

Expected validations:
- ✅ Device status updated (last_seen_at, is_active)
- ✅ Telemetry record created
- ✅ Image record in "complete" status
- ✅ Wake session created and completed
- ✅ Device history events logged

---

### Test 2: Missing Chunks Retry

**What it tests:**
- Intentional chunk drops during transmission
- Server detection of missing chunks
- missing_chunks request from server
- Device retry of specific chunks only
- Successful reassembly after retries

**Run the test:**

```bash
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-001 --test missing_chunks
```

**Expected output:**

```
==================================================================
TEST CASE 2: Missing Chunks Retry
==================================================================

[CHUNKS] Sending 10 chunks...
[CHUNKS] ⚠️  Simulating missing chunk 3/10
[CHUNKS] ⚠️  Simulating missing chunk 6/10
[CHUNKS] ⚠️  Simulating missing chunk 9/10
[CHUNKS] Sent 10/10 chunks (100.0%)
[CHUNKS] ✅ All chunks sent

[ACK] Server requests 3 missing chunks: [2, 5, 8]
[RETRY] Resending missing chunks...
[RETRY] Resent chunk 2
[RETRY] Resent chunk 5
[RETRY] Resent chunk 8

[ACK] ✅ Image transmission successful!

✅ TEST PASSED: Missing chunks detected and retried
```

**Validate results:**

```bash
node validate-mqtt-protocol.mjs --mac=TEST-ESP32-001 --since=5
```

Expected validations:
- ✅ Device history shows "missing_chunks_requested" event
- ✅ Wake session shows chunks_missing field
- ✅ Image still reaches "complete" status
- ✅ All chunks eventually received

---

### Test 3: Offline Recovery

**What it tests:**
- Device reporting pending image count
- Server requesting multiple pending images
- Sequential transmission of backlog
- Proper ACK handling between images
- Complete recovery of offline period data

**Run the test:**

```bash
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-001 --test offline_recovery
```

**Expected output:**

```
==================================================================
TEST CASE 3: Offline Recovery
==================================================================

[RECOVERY] Simulating offline recovery with 3 pending images

[STATUS] Sending alive message (pending: 3)

[RECOVERY] Sending pending image 1/3
[CAPTURE] Simulating image capture: image_1699564401000.jpg
[CHUNKS] Sending 5 chunks...
[ACK] ✅ Image transmission successful!
[RECOVERY] ✅ Image 1 acknowledged

[RECOVERY] Sending pending image 2/3
[CAPTURE] Simulating image capture: image_1699564432000.jpg
[CHUNKS] Sending 6 chunks...
[ACK] ✅ Image transmission successful!
[RECOVERY] ✅ Image 2 acknowledged

[RECOVERY] Sending pending image 3/3
[CAPTURE] Simulating image capture: image_1699564463000.jpg
[CHUNKS] Sending 7 chunks...
[ACK] ✅ Image transmission successful!
[RECOVERY] ✅ Image 3 acknowledged

✅ TEST PASSED: Offline recovery completed
```

**Validate results:**

```bash
node validate-mqtt-protocol.mjs --mac=TEST-ESP32-001 --since=10
```

Expected validations:
- ✅ 3 separate image records created
- ✅ 3 wake sessions created
- ✅ All images in "complete" status
- ✅ Sequential timestamps on images
- ✅ Device history shows recovery events

---

### Test 4: Run All Tests

**Run comprehensive test suite:**

```bash
python3 mqtt-test-device-simulator.py --mac TEST-ESP32-001 --test all
```

**Expected summary:**

```
==================================================================
TEST SUMMARY
==================================================================
normal              : ✅ PASSED
missing_chunks      : ✅ PASSED
offline_recovery    : ✅ PASSED
==================================================================
```

---

## 📊 Validation and Monitoring

### Quick Validation

After running any test, validate the results:

```bash
node validate-mqtt-protocol.mjs --mac=TEST-ESP32-001
```

This checks:
- Device status updates
- Telemetry data (last 10 minutes)
- Image transmission status
- Wake session tracking
- Device history events
- Submissions and observations creation

### Live Monitoring Mode

Monitor protocol activity in real-time:

```bash
node validate-mqtt-protocol.mjs --mac=TEST-ESP32-001 --monitor
```

This runs continuous validation every 30 seconds and displays updates.

### Custom Time Windows

Check data from a specific time period:

```bash
# Last 5 minutes
node validate-mqtt-protocol.mjs --mac=TEST-ESP32-001 --since=5

# Last hour
node validate-mqtt-protocol.mjs --mac=TEST-ESP32-001 --since=60

# Last 24 hours
node validate-mqtt-protocol.mjs --mac=TEST-ESP32-001 --since=1440
```

---

## 🔍 Database Queries for Manual Validation

### Check Device Status

```sql
SELECT
  device_mac,
  device_code,
  provisioning_status,
  is_active,
  last_seen_at,
  firmware_version,
  site_id,
  program_id
FROM devices
WHERE device_mac = 'TEST-ESP32-001';
```

### Check Recent Telemetry

```sql
SELECT
  captured_at,
  temperature,
  humidity,
  pressure,
  gas_resistance
FROM device_telemetry
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-001')
ORDER BY captured_at DESC
LIMIT 10;
```

### Check Image Transmission

```sql
SELECT
  image_name,
  status,
  received_chunks,
  total_chunks,
  image_size,
  image_url,
  created_at,
  received_at
FROM device_images
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-001')
ORDER BY created_at DESC
LIMIT 10;
```

### Check Wake Sessions

```sql
SELECT
  session_id,
  wake_timestamp,
  status,
  image_captured,
  chunks_sent,
  chunks_total,
  transmission_complete,
  session_duration_ms,
  next_wake_scheduled
FROM device_wake_sessions
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-001')
ORDER BY wake_timestamp DESC
LIMIT 10;
```

### Check Device History

```sql
SELECT
  event_timestamp,
  event_category,
  event_type,
  severity,
  description
FROM device_history
WHERE device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-001')
ORDER BY event_timestamp DESC
LIMIT 20;
```

### Check Submissions and Observations

```sql
-- Submissions
SELECT
  submission_id,
  site_id,
  program_id,
  is_device_generated,
  created_at
FROM submissions
WHERE created_by_device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-001')
ORDER BY created_at DESC
LIMIT 10;

-- Observations
SELECT
  o.observation_id,
  o.submission_id,
  o.image_url,
  o.is_device_generated,
  o.device_capture_metadata,
  o.created_at
FROM petri_observations o
INNER JOIN submissions s ON o.submission_id = s.submission_id
WHERE s.created_by_device_id = (SELECT device_id FROM devices WHERE device_mac = 'TEST-ESP32-001')
ORDER BY o.created_at DESC
LIMIT 10;
```

---

## 🐛 Troubleshooting

### Issue: Simulator Can't Connect to MQTT

**Symptoms:**
```
[MQTT] ❌ Connection timeout
```

**Solutions:**
1. Verify MQTT service is running: `curl http://localhost:3000/health`
2. Check HiveMQ Cloud credentials are correct
3. Verify network allows port 8883 (MQTT over TLS)
4. Check firewall settings

### Issue: No Data in Database

**Symptoms:**
```
❌ No telemetry data in last 10 minutes
❌ No images transmitted in last 10 minutes
```

**Solutions:**
1. Check MQTT service logs for errors
2. Verify database connection in `.env` file
3. Run schema validation: `node verify-schema-complete.mjs`
4. Check RLS policies allow service role to insert
5. Review Supabase logs for SQL errors

### Issue: Images Stuck in "receiving" Status

**Symptoms:**
```
Image Status: receiving
Chunks: 4/10
⚠️ Warning: 1 image(s) stuck in receiving state for >5 minutes
```

**Solutions:**
1. Check if all chunks were received: Review device_images.received_chunks
2. Verify chunk reassembly logic in MQTT handler
3. Look for missing chunk requests in device_history
4. Check memory limits (large images may fail)
5. Review MQTT service logs for errors during reassembly

### Issue: Submissions Not Created

**Symptoms:**
```
❌ No submissions created in last 10 minutes
This is expected if device is not mapped to a site yet
```

**Solutions:**
1. **Map the device to a site:**
   ```sql
   UPDATE devices
   SET site_id = '<valid-site-id>',
       program_id = '<valid-program-id>',
       provisioning_status = 'mapped'
   WHERE device_mac = 'TEST-ESP32-001';
   ```
2. Verify site and program exist and are active
3. Check foreign key constraints
4. Review MQTT handler submission creation logic

### Issue: Missing Chunk Retry Fails

**Symptoms:**
```
❌ TEST FAILED: Missing chunk retry mechanism failed
```

**Solutions:**
1. Check device_history for "missing_chunks_requested" events
2. Verify server sent missing_chunks message
3. Check device received and processed retry request
4. Review MQTT handler chunk verification logic
5. Ensure device simulator processes ACK messages correctly

---

## 📈 Performance Benchmarks

### Expected Performance

| Metric | Target | Typical |
|--------|--------|---------|
| Image transmission time (50KB) | < 10s | 5-8s |
| Chunk transmission rate | > 5 chunks/sec | 8-12 chunks/sec |
| Wake session duration | < 30s | 15-25s |
| Missing chunk retry time | < 5s | 2-4s |
| Database write latency | < 500ms | 100-300ms |

### Monitoring Queries

```sql
-- Average session duration
SELECT
  AVG(session_duration_ms) / 1000.0 as avg_duration_seconds,
  COUNT(*) as total_sessions
FROM device_wake_sessions
WHERE status = 'success'
AND wake_timestamp > NOW() - INTERVAL '24 hours';

-- Image success rate
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM device_images
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Chunk transmission efficiency
SELECT
  device_id,
  AVG(chunks_sent::float / chunks_total) * 100 as avg_transmission_efficiency,
  COUNT(*) as sessions
FROM device_wake_sessions
WHERE chunks_total > 0
AND wake_timestamp > NOW() - INTERVAL '24 hours'
GROUP BY device_id;
```

---

## ✅ Test Checklist

Use this checklist to ensure complete protocol validation:

- [ ] MQTT service is running and connected
- [ ] Database schema is complete (22/22 checks)
- [ ] Test device is registered or can auto-provision
- [ ] Python dependencies installed (paho-mqtt)
- [ ] Normal operation test passes
- [ ] Missing chunks retry test passes
- [ ] Offline recovery test passes
- [ ] Device status updates correctly
- [ ] Telemetry data is recorded
- [ ] Images reach "complete" status
- [ ] Wake sessions are tracked
- [ ] Device history events are logged
- [ ] Submissions created (if device mapped)
- [ ] Observations linked to submissions
- [ ] Storage bucket receives images
- [ ] ACK messages include next_wake_time
- [ ] No stuck transmissions after 5 minutes
- [ ] Performance meets benchmarks

---

## 🚀 Next Steps After Successful Testing

1. **Test with Real ESP32-CAM Device**
   - Flash production firmware
   - Configure WiFi via BLE
   - Verify auto-provisioning works
   - Test in real-world conditions

2. **Load Testing**
   - Simulate 10+ devices simultaneously
   - Test with larger images (100KB+)
   - Verify concurrent session handling
   - Monitor memory usage and performance

3. **Edge Case Testing**
   - Very large images (>500KB)
   - Network interruptions mid-transmission
   - Rapid succession wake cycles
   - Extremely long offline periods (>1 week)

4. **Production Deployment**
   - Deploy MQTT service to production environment
   - Configure monitoring and alerting
   - Set up automated health checks
   - Create operational runbooks

---

## 📚 Additional Resources

- **Architecture Document**: `docs/BrainlyTree_ESP32CAM_AWS_V4.pdf`
- **Device Flow Diagram**: `DEVICE_FLOW_DIAGRAM.md`
- **Provisioning Guide**: `DEVICE_PROVISIONING_FLOW.md`
- **MQTT Deployment Guide**: `MQTT_DEPLOYMENT_GUIDE.md`
- **Database Schema**: `supabase/migrations/20251107*.sql`

---

**Happy Testing! 🎉**

For questions or issues, check the troubleshooting section or review the MQTT service logs.
