# MQTT Device Testing Guide - Complete Test Suite

## Overview

This guide provides a comprehensive test suite for your ESP32-CAM IoT device system based on the BrainlyTree protocol specification. Use this to test all scenarios including normal operation, offline recovery, chunk retries, and edge cases.

## Current Architecture

### Working Setup (Local MQTT Service)
```
ESP32 Device → HiveMQ Cloud Broker → Local MQTT Service (Node.js) → Supabase Database
                                              ↓
                                    Publishes MQTT Commands Back to Device
```

**Status:** ✅ Fully Functional
- Implements complete protocol from PDF
- Sends commands back to devices via MQTT
- Handles provisioning, chunks, ACKs, retries
- No delays

### Production Setup (Edge Function - Currently Non-Functional)
```
ESP32 Device → HiveMQ Cloud Broker → Local MQTT Service → HTTP POST → Edge Function
                                                                              ↓
                                                                    ❌ No MQTT Client
                                                                    Can't Respond to Device
```

**Status:** ❌ Incomplete
- Receives messages but can't publish responses
- Causes 2-minute timeouts
- Needs MQTT client integration

---

## Test Scenarios (From PDF Section 10)

### Test Suite Structure

Based on **PDF Section 10.3**, here are all test scenarios organized by category:

## Category 1: Unit Tests

### UT-01: Chunk Split & Assemble
**Objective:** Verify chunking algorithm works correctly

**Test Steps:**
```bash
# Run from project root
node test/test-chunk-assembly.mjs
```

**Expected Result:**
- Image splits into correct number of chunks
- Reassembly produces identical image
- CRC validation passes

---

### UT-02: Server Detects Missing Chunks
**Objective:** Missing chunk detection logic

**Manual Test:**
```javascript
// Simulate receiving chunks [1,2,3,5,6,7,8,9,10] out of 10
// Expected: Server should detect missing chunk [4]
```

**Test Script:**
```bash
node test/test-missing-chunks.mjs
```

---

### UT-03: pendingImage.txt Management
**Objective:** Verify pending queue operations

**Test Scenario:**
1. Device goes offline
2. Captures 3 images → 3 entries in pendingImage.txt
3. Device comes online
4. Server ACKs each image
5. Verify pendingImage.txt is empty

**Test Script:**
```bash
node test/test-pending-queue.mjs
```

---

### UT-04: Device Retry on ACK_MISSING
**Objective:** Device resends only requested chunks

**Manual Test:**
1. Send image with 10 chunks
2. Manually trigger server to request chunks [3, 7]
3. Verify device only resends those two chunks

---

### UT-05: Wi-Fi Connection Retries
**Objective:** 3×8s retry logic

**Device-Side Test** (modify firmware):
```cpp
// Set Wi-Fi to wrong SSID temporarily
// Verify: 3 connection attempts, 8 seconds each
// Total ~24 seconds before offline mode
```

---

## Category 2: Integration Tests

### IT-01: Offline Capture Queue & Recovery ⭐ IMPORTANT

**Objective:** Full offline/online cycle with multiple images

**Test Steps:**

1. **Setup Initial State:**
```bash
# Check device is online and provisioned
node check-device-002-status.mjs
```

2. **Simulate Offline Period:**
```bash
# Disconnect device from WiFi (physically or via firmware)
# Let device capture 3 images in offline mode
# Each capture adds entry to SD card:
#   - metadata.txt (full history)
#   - pendingImage.txt (pending queue)
```

3. **Verify Offline Storage:**
```javascript
// On SD card, verify:
// metadata.txt has 3 entries with PendingToSend=true
// pendingImage.txt has 3 entries
```

4. **Reconnect and Test Recovery:**
```javascript
// Device sends status message with pending_count=3:
{
  "device_id": "DEVICE-ESP32S3-002",
  "device_mac": "A6:C7:B4:11:22:33",
  "status": "alive",
  "pending_count": 3,  // ← Key field!
  "firmware_version": "bt-aws-v4.0.0",
  "hardware_version": "ESP32-S3"
}
```

5. **Expected Server Response:**
```javascript
// Server should issue 4 total commands:
// 1. capture_image (current)
// 2. send_image (pending #1)
// 3. send_image (pending #2)
// 4. send_image (pending #3)
```

6. **Verify Each Image:**
- Device sends metadata
- Device sends all chunks
- Server responds with ACK_OK
- Entry removed from pendingImage.txt
- metadata.txt updated to PendingToSend=false

**Success Criteria:**
- All 4 images received by server
- pendingImage.txt empty
- metadata.txt shows all PendingToSend=false
- Database has 4 device_images records

**Test Script:**
```bash
node test/test-offline-recovery.mjs
```

---

### IT-02: Partial Chunk Loss & Retransmit ⭐ IMPORTANT

**Objective:** Verify chunk retry mechanism

**Test Steps:**

1. **Send Test Image:**
```javascript
// Device sends image with 10 chunks
// Publish to: device/TESTC1/data
```

2. **Simulate Packet Loss:**
```javascript
// Server intentionally "loses" chunks [4, 9]
// (Modify local MQTT service temporarily)
```

3. **Server Sends ACK_MISSING:**
```javascript
// Topic: device/TESTC1/ack
{
  "device_id": "TESTC1",
  "image_name": "image_001.jpg",
  "missing_chunks": [4, 9]
}
```

4. **Verify Device Response:**
- Device resends ONLY chunks 4 and 9
- Does NOT resend chunks 1-3, 5-8, 10

5. **Server Sends ACK_OK:**
```javascript
{
  "device_id": "TESTC1",
  "image_name": "image_001.jpg",
  "ACK_OK": {
    "next_wake_time": "2025-11-16T12:00:00Z"
  }
}
```

**Success Criteria:**
- Image reassembled correctly
- Only missing chunks retransmitted
- Final image binary identical to original

**Test Script:**
```bash
node test/test-chunk-retry.mjs
```

---

## Category 3: End-to-End Tests (Hardware Required)

### E2E-01: 5-Day Offline Mode

**Objective:** Extended offline operation

**Test Steps:**

1. **Initial Setup:**
```bash
# Device fully provisioned and mapped to site
# Verify in database:
SELECT * FROM devices WHERE device_mac = 'YOUR_MAC';
# Should have site_id, program_id, company_id
```

2. **Disconnect WiFi:**
- Power off router OR
- Change WiFi credentials on device OR
- Move device out of range

3. **Let Device Run:**
- 5 wake cycles (e.g., 12 hours apart = 2.5 days)
- Device captures images each wake
- Stores locally on SD card

4. **Verify SD Card:**
```text
metadata.txt should have 5 entries:
  - Each with PendingToSend=true
  - Timestamps progressing

pendingImage.txt should have 5 entries
```

5. **Reconnect WiFi:**
- Restore network access

6. **Monitor MQTT Messages:**
```bash
# Watch for status message:
{
  "device_id": "...",
  "status": "alive",
  "pending_count": 5  // ← Critical!
}
```

7. **Server Issues 6 Requests:**
- 1 for current capture
- 5 for pending backlog

8. **Verify Upload Sequence:**
```bash
# Each image should:
# 1. Send metadata
# 2. Send all chunks
# 3. Receive ACK_OK
# 4. Remove from pendingImage.txt
# 5. Update metadata.txt
```

**Success Criteria:**
- Zero data loss
- All 6 images in database
- pendingImage.txt empty after sync
- Timestamps preserved correctly

---

### E2E-02: Online Mode - No Retries (Happy Path)

**Objective:** Perfect transmission, no errors

**Test Steps:**

1. **Device Wakes Up:**
```javascript
// Topic: device/DEVICE-ESP32S3-002/status
{
  "device_id": "DEVICE-ESP32S3-002",
  "device_mac": "A6:C7:B4:11:22:33",
  "status": "alive",
  "pending_count": 0,
  "battery_voltage": 3.95,
  "wifi_rssi": -58
}
```

2. **Server Command:**
```javascript
// Topic: device/DEVICE-ESP32S3-002/cmd
{
  "device_id": "DEVICE-ESP32S3-002",
  "capture_image": true
}
```

3. **Device Sends Metadata:**
```javascript
// Topic: device/DEVICE-ESP32S3-002/data
{
  "device_id": "DEVICE-ESP32S3-002",
  "capture_timestamp": "2025-11-15T10:30:00Z",
  "image_name": "img_20251115_103000.jpg",
  "image_size": 45128,
  "total_chunks_count": 352,
  "max_chunk_size": 128,
  "temperature": 22.5,
  "humidity": 45.2,
  "pressure": 1013.2,
  "gas_resistance": 120000,
  "location": "Field-A"
}
```

4. **Server Command:**
```javascript
// Topic: device/DEVICE-ESP32S3-002/cmd
{
  "device_id": "DEVICE-ESP32S3-002",
  "send_image": "img_20251115_103000.jpg"
}
```

5. **Device Sends Chunks (352 total):**
```javascript
// Topic: device/DEVICE-ESP32S3-002/data (repeated 352 times)
{
  "device_id": "DEVICE-ESP32S3-002",
  "image_name": "img_20251115_103000.jpg",
  "chunk_id": 0,  // 0 to 351
  "max_chunk_size": 128,
  "payload": "base64_encoded_bytes..."
}
```

6. **Server Sends ACK_OK:**
```javascript
// Topic: device/DEVICE-ESP32S3-002/ack
{
  "device_id": "DEVICE-ESP32S3-002",
  "image_name": "img_20251115_103000.jpg",
  "ACK_OK": {
    "next_wake_time": "2025-11-15T22:30:00Z"
  }
}
```

7. **Device Goes to Sleep:**
- Calculates sleep duration
- Sets RTC timer for next_wake_time
- Enters deep sleep

**Success Criteria:**
- All chunks received
- Image reassembled correctly
- Device received next_wake_time
- Device sleeps until scheduled time

**Monitoring:**
```bash
# Watch local MQTT service logs:
tail -f mqtt-service/mqtt-service.log

# Check database:
SELECT * FROM device_images
WHERE device_id = 'YOUR_DEVICE_ID'
ORDER BY created_at DESC LIMIT 1;
```

---

### E2E-03: Online Mode - With Chunk Retries

**Objective:** Verify retry mechanism with real device

**Test Steps:**

1. **Normal Start:** (Same as E2E-02 steps 1-4)

2. **Inject Packet Loss:**
```bash
# Modify local MQTT service to drop random chunks
# OR
# Temporarily disconnect network during chunk transmission
```

3. **Server Detects Missing Chunks:**
```javascript
// After timeout or all expected chunks received
// Server calculates: received [1-10, 12-352], missing [11]
```

4. **Server Sends ACK_MISSING:**
```javascript
// Topic: device/DEVICE-ESP32S3-002/ack
{
  "device_id": "DEVICE-ESP32S3-002",
  "image_name": "img_20251115_103000.jpg",
  "missing_chunks": [11]
}
```

5. **Device Resends Missing:**
```javascript
// Device sends only chunk 11
{
  "device_id": "DEVICE-ESP32S3-002",
  "image_name": "img_20251115_103000.jpg",
  "chunk_id": 11,
  "payload": "..."
}
```

6. **Server Sends ACK_OK:**
```javascript
{
  "device_id": "DEVICE-ESP32S3-002",
  "image_name": "img_20251115_103000.jpg",
  "ACK_OK": {
    "next_wake_time": "2025-11-15T22:30:00Z"
  }
}
```

**Success Criteria:**
- Missing chunks detected
- Only missing chunks retransmitted
- Image complete and valid
- Next wake time received

---

## Quick Test Scripts

### Test 1: Device Auto-Provisioning

```bash
# Send status message for new device:
node scripts/test-auto-provision.mjs

# Expected:
# - New device created in database
# - device_code generated (e.g., DEVICE-ESP32S3-007)
# - provisioning_status = 'pending_mapping'
# - device_type = 'physical'
# - company_id = null (shows in Device Pool)
```

### Test 2: View Device Pool (Super Admin)

```bash
# As super admin, check Device Pool page
# Navigate to: /device-pool

# Or query directly:
node scripts/check-device-pool.mjs

# Expected:
# - All devices with company_id = null
# - Status 'pending_mapping' or 'pending_approval'
# - Can assign to company
```

### Test 3: Device Status Update

```bash
# Send heartbeat:
node scripts/test-device-heartbeat.mjs

# Expected:
# - last_seen_at updated
# - is_active = true
# - battery data updated
```

---

## Debugging Tips

### Check MQTT Service Logs
```bash
tail -f /tmp/cc-agent/51386994/project/mqtt-service/mqtt-service.log
```

### Check Database State
```bash
node check-device-002-status.mjs
```

### Test MQTT Connectivity
```bash
# Install mosquitto clients:
# mosquitto_sub -h BROKER -p 8883 -u USER -P PASS -t 'device/+/status' --cafile cert.pem

# Or use MQTT Explorer GUI tool
```

### Monitor Edge Function (If Using)
```bash
# Not yet functional - Edge Function can't respond to devices
# Use local MQTT service for now
```

---

## Test Execution Checklist

- [ ] UT-01: Chunk split/assemble
- [ ] UT-02: Missing chunk detection
- [ ] UT-03: Pending queue management
- [ ] UT-04: Device retry logic
- [ ] UT-05: WiFi retry logic
- [ ] IT-01: Offline recovery (3 images)
- [ ] IT-02: Chunk retry mechanism
- [ ] E2E-01: 5-day offline test (hardware)
- [ ] E2E-02: Happy path (hardware)
- [ ] E2E-03: Retry with packet loss (hardware)

---

## Current Limitations

### Edge Function
- ❌ Cannot publish MQTT messages back to devices
- ❌ Causes 2-minute timeouts when called
- ❌ Protocol incomplete

**Workaround:** Use local MQTT service exclusively

### Local MQTT Service
- ✅ Full protocol implementation
- ✅ All test scenarios work
- ✅ No delays
- ⚠️ Must run locally (not deployed)

---

## Next Steps for Production

To make Edge Function work:

1. **Add MQTT client to Edge Function:**
   - Connect to HiveMQ from Edge Function
   - Publish commands back to devices
   - Handle ACK/NACK responses

2. **OR: Keep local MQTT service:**
   - Deploy to a VPS/container
   - Run 24/7 alongside your app
   - More reliable for MQTT protocol

**Recommendation:** Use local MQTT service architecture. Edge Functions are not ideal for stateful MQTT connections.

---

## Support

For issues or questions:
1. Check MQTT service logs
2. Verify device is provisioned in database
3. Confirm MQTT broker connectivity
4. Review protocol spec in PDF (Section 5, 8)
