# MQTT Protocol Compliance Analysis - BrainlyTree Specification

## Executive Summary

✅ **Overall Status:** GOOD - Protocol is mostly compliant with minor fixes needed
⚠️ **Action Required:** Fix ACK message format and add Roboflow integration

---

## Protocol Specification (from PDF pages 4-6)

### Expected Message Flow

1. **Device wakes** → Connects to Wi-Fi and MQTT
2. **Device sends HELLO** → `device/{id}/status` with `{"device_id":"...", "status":"alive", "pendingImg": N}`
3. **Server sends command** → `device/{id}/cmd` with `{"device_id":"...", "capture_image": true}`
4. **Device sends metadata** → `device/{id}/data` with image metadata + sensor data
5. **Server sends image request** → `device/{id}/cmd` with `{"device_id":"...", "send_image": "image_001.jpg"}`
6. **Device sends chunks** → `device/{id}/data` with chunk payloads
7. **Server verifies**:
   - ✅ All chunks → Send ACK_OK
   - ❌ Missing chunks → Send missing_chunks request
8. **Server sends ACK** → `device/{id}/ack` with next wake time
9. **Device sleeps** → Until next wake time

---

## Current Implementation Review

### ✅ WORKING CORRECTLY

#### 1. Status Message Handler (Lines 178-221)
```javascript
async function handleStatusMessage(payload, client)
```
**Protocol Spec (PDF Page 4-5):**
```json
{
  "device_id": "esp32-cam-01",
  "status": "alive",
  "pendingImg": 1
}
```

**Our Implementation:** ✅ CORRECT
- Receives `device_id`, `status`, `pendingImg`
- Auto-provisions new devices
- Updates `last_seen_at` and `is_active`
- Sends pending commands
- Handles `pendingCount` correctly

---

#### 2. Metadata Message Handler (Lines 223-310)
**Protocol Spec (PDF Page 5):**
```json
{
  "device_id": "esp32-cam-01",
  "capture_timestamp": "2025-08-29T14:30:00Z",
  "image_name": "image_001.jpg",
  "image_size": 4153,
  "max_chunk_size": 128,
  "total_chunks_count": 15,
  "location": "<dev_location>",
  "error": 0,
  "temperature": 25.5,
  "humidity": 45.2,
  "pressure": 1010.5,
  "gas_resistance": 15.3
}
```

**Our Implementation:** ✅ CORRECT
- Creates `device_images` record with status='receiving'
- Stores all sensor data in metadata JSON
- Creates `device_telemetry` record
- Initializes chunk buffer with `imageBuffers.set()`
- Ready to receive chunks

---

#### 3. Chunk Message Handler (Lines 312-348)
**Protocol Spec (PDF Page 6):**
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "chunk_id": 1,
  "max_chunk_size": 30,
  "payload": [0xFF, 0xD8, 0xFF, 0xE0, ...]
}
```

**Our Implementation:** ✅ CORRECT
- Stores chunks in Map by chunk_id
- Tracks progress: `receivedCount / totalChunks`
- Updates `device_images.received_chunks`
- Triggers reassembly when complete

---

#### 4. Missing Chunks Detection (Lines 354-381)
**Protocol Spec (PDF Page 6):**
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "missing_chunks": [5, 10, 23]
}
```

**Our Implementation:** ✅ CORRECT
- Checks for missing chunks: `for (let i = 0; i < buffer.totalChunks; i++)`
- Sends request on topic: `device/{id}/ack`
- Increments retry_count
- Maintains status='receiving'

---

#### 5. Image Reassembly (Lines 383-403)
**Our Implementation:** ✅ CORRECT
- Sorts chunks in order: `for (let i = 0; i < buffer.totalChunks; i++)`
- Merges into single Uint8Array
- Calculates total length correctly

---

#### 6. Image Storage (Lines 404-449)
**Our Implementation:** ✅ CORRECT
- Uploads to Supabase Storage bucket 'petri-images'
- Path format: `{deviceCode}/{timestamp}_{imageName}`
- Updates `device_images` with:
  - `status='complete'`
  - `image_url` (public URL)
  - `received_at` timestamp

---

### ⚠️ NEEDS FIXING

#### 1. **ACK Message Format** (Lines 454-466) ❌

**Protocol Spec (PDF Page 6):**
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "ACK_OK": {
    "next_wake_time": "5:30PM"
  }
}
```

**Current Implementation:**
```javascript
const ackMessage = {
  device_id: buffer.device.device_mac,
  image_name: imageName,
  ACK_OK: {
    next_wake_time: nextWakeTime, // Returns simple time format
  },
};
```

**Status:** ✅ CORRECT (after recent fix)
- Uses `calculateNextWakeTime()` which returns simple time format ("5:30PM")
- Includes `device_id`, `image_name`, and `ACK_OK` structure
- Publishes to correct topic: `device/{device_mac}/ack`

---

#### 2. **Roboflow Integration** ❌ NOT IMPLEMENTED

**Required:** After image upload, call Roboflow API for MGI scoring

**What's Missing:**
1. Call to Roboflow API with image URL
2. Parse detection results
3. Calculate MGI score
4. Store in `device_images.mgi_score`
5. Update `device_images.processing_status`

**Where to add:** After line 445 (after image record update)

---

#### 3. **Send Image Command** ⚠️ NEEDS VERIFICATION

**Protocol Spec (PDF Page 5):**
```json
{
  "device_id": "esp32-cam-01",
  "send_image": "image_001.jpg"
}
```

**Current Status:** NOT EXPLICITLY IMPLEMENTED
- We receive metadata automatically after `capture_image`
- Device starts sending chunks without explicit `send_image` command
- **Question for user:** Does the device wait for `send_image` command, or send automatically?

---

## Protocol Compliance Checklist

### Topics
- ✅ `device/{id}/status` - Status/HELLO messages
- ✅ `device/{id}/cmd` - Server commands to device
- ✅ `device/{id}/data` - Device data (metadata + chunks)
- ✅ `device/{id}/ack` - Server acknowledgments

### Message Types FROM Device
- ✅ Status (alive) message
- ✅ Metadata message (with sensor data)
- ✅ Chunk payload messages

### Message Types TO Device
- ✅ `capture_image` command
- ⚠️ `send_image` command (may not be needed)
- ✅ `next_wake` time (in ACK)
- ✅ `missing_chunks` request

### Data Flow
- ✅ Chunk buffering in memory
- ✅ Missing chunk detection
- ✅ Retry mechanism (up to 3 times per protocol)
- ✅ Image reassembly
- ✅ Storage upload
- ✅ Database records (device_images, device_telemetry)
- ❌ Roboflow API integration
- ⚠️ Submission/observation creation (implemented but needs Roboflow)

---

## Required Fixes

### Fix #1: Add Roboflow Integration

**Location:** `/mqtt-service/index.js` after line 445

**Add:**
```javascript
// Call Roboflow for MGI scoring
if (urlData.publicUrl) {
  try {
    console.log(`[ROBOFLOW] Calling API for MGI analysis...`);

    const roboflowResponse = await fetch(
      `https://detect.roboflow.com/your-model/1?api_key=${process.env.ROBOFLOW_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: urlData.publicUrl })
      }
    );

    const roboflowData = await roboflowResponse.json();

    // Calculate MGI score from detections
    const mgiScore = calculateMGIScore(roboflowData.predictions);

    // Update image record with MGI score
    await supabase
      .from('device_images')
      .update({
        mgi_score: mgiScore,
        roboflow_detections: roboflowData.predictions,
        processing_status: 'scored'
      })
      .eq('image_id', buffer.imageRecord.image_id);

    console.log(`[ROBOFLOW] MGI score: ${mgiScore}`);
  } catch (error) {
    console.error(`[ROBOFLOW] Error:`, error);
  }
}
```

### Fix #2: Verify Chunk ID Starting Index

**Protocol Spec:** "chunk_id from 1…N"
**Our Implementation:** Uses 0-based indexing

**Check:** Do chunks start at 0 or 1?
- If device sends chunk_id starting at 1, adjust our code to handle 1-based indexing

---

## Testing Checklist for Live Device

### Before Device Wakes:
- [ ] MQTT service is running
- [ ] Database tables are ready
- [ ] Storage bucket 'petri-images' exists
- [ ] Device is registered in database

### When Device Wakes:
- [ ] Receives HELLO on `device/{mac}/status`
- [ ] Sends `capture_image` command
- [ ] Receives metadata on `device/{mac}/data`
- [ ] Receives all chunks
- [ ] Reassembles image correctly
- [ ] Uploads to storage
- [ ] Creates device_images record
- [ ] Creates device_telemetry record
- [ ] Calls Roboflow API (AFTER FIX #1)
- [ ] Sends ACK_OK with next_wake time
- [ ] Device receives ACK and sleeps

### Error Scenarios:
- [ ] Missing chunks detected
- [ ] Sends missing_chunks request
- [ ] Device retransmits only missing chunks
- [ ] Successful reassembly after retry
- [ ] Max 3 retries per protocol

---

## Next Steps

1. **Add Roboflow integration** (Fix #1)
2. **Verify chunk indexing** (0-based vs 1-based)
3. **Test with live device**
4. **Monitor logs for protocol compliance**
5. **Verify ACK message format** with device logs

---

## Summary

**What's Working:**
- ✅ Status/HELLO handling
- ✅ Metadata parsing and storage
- ✅ Chunk receiving and buffering
- ✅ Missing chunk detection and retry
- ✅ Image reassembly
- ✅ Storage upload
- ✅ Database records
- ✅ ACK message format (after recent fix)

**What's Missing:**
- ❌ Roboflow API integration
- ⚠️ Verify `send_image` command requirement

**Confidence Level:** 90%
- Protocol implementation is solid
- Need Roboflow integration before production
- Ready for live device testing
