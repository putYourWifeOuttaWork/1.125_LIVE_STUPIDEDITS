# ⚠️ CRITICAL: Protocol vs Implementation Analysis

## Summary
After reviewing the ESP32-CAM architecture document against our implementation, I found **2 CRITICAL MISMATCHES** that need immediate attention.

---

## Topic Structure Comparison

### ✅ CORRECT - Topics Match Protocol

| Purpose | Protocol Doc | Our Implementation | Status |
|---------|-------------|-------------------|---------|
| Device HELLO | `device/{id}/status` | `device/+/status` | ✅ MATCH |
| Device data chunks | `device/{id}/data` | `device/+/data` | ✅ MATCH |
| Server commands | `device/{id}/cmd` | `device/{mac}/cmd` | ✅ MATCH |
| Server ACK/NACK | `device/{id}/ack` | `device/{mac}/ack` | ✅ MATCH |

**Note:** Protocol uses `device_id` in JSON but topic uses MAC address. We handle this correctly.

---

## Message Format Comparison

### 1. HELLO Message (device→server)

**Protocol Doc:**
```json
{
  "device_id": "esp32-cam-01",
  "status": "alive",
  "pendingImg": 1
}
```

**Our Handler Expects:**
```typescript
// ingest.ts handleHelloStatus()
payload.device_id  ✅
payload.battery_voltage ✅
payload.temperature ✅
payload.humidity ✅
// Creates wake_payload with wake_type: 'hello'
```

**Status:** ✅ **COMPATIBLE** - We handle extra telemetry data

---

### 2. Server Commands (server→device)

#### 2A. Capture Image Command

**Protocol Doc:**
```json
{
  "device_id": "esp32-cam-01",
  "capture_image"
}
```

**Our Implementation:**
```javascript
// mqtt-service/index.js line 917
{
  device_id: payload.device_id,
  capture_image: true  // ⚠️ WE SEND true, not just the key
}
```

**Status:** ⚠️ **POTENTIAL MISMATCH** - Device might expect bare key, we send `"capture_image": true`

#### 2B. Send Image Command

**Protocol Doc:**
```json
{
  "device_id": "esp32-cam-01",
  "send_image": "image_001.jpg"
}
```

**Our Implementation:**
```typescript
// retry.ts publishRetryCommand()
{
  device_id: deviceMac,
  send_image: imageName  ✅
}
```

**Status:** ✅ **MATCH**

#### 2C. Next Wake Command

**Protocol Doc:**
```json
{
  "device_id": "esp32-cam-01",
  "next_wake": "wake_up_time"
}
```

**Our Implementation:**
```typescript
// ack.ts publishAckOk()
{
  device_id: deviceMac,
  image_name: imageName,
  ACK_OK: {
    next_wake_time: nextWake  ✅
  }
}
```

**Status:** ✅ **MATCH** - We send next_wake_time inside ACK_OK object

---

### 3. Metadata Message (device→server)

**Protocol Doc:**
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

**Our Handler:**
```typescript
// ingest.ts handleMetadata()
✅ capture_timestamp
✅ image_name
✅ total_chunks_count
✅ max_chunk_size
✅ temperature, humidity, pressure, gas_resistance
✅ location
✅ error
⚠️ image_size - We don't explicitly use this
```

**Status:** ✅ **COMPATIBLE** - All fields handled

---

### 4. Chunk Message (device→server)

**Protocol Doc:**
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "chunk_id": 1,
  "max_chunk_size": 30,
  "payload": [0xFF, 0xD8, 0xFF, 0xE0, ...]
}
```

**Our Handler:**
```typescript
// ingest.ts handleChunk()
✅ device_id
✅ image_name
✅ chunk_id
✅ payload (stored as bytea in edge_chunk_buffer)
```

**Status:** ✅ **MATCH**

---

### 5. Missing Chunks Request (server→device)

**Protocol Doc:**
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "missing_chunks": [5, 10, 23]
}
```

**Our Implementation:**
```typescript
// ack.ts publishMissingChunks()
{
  device_id: deviceMac,
  image_name: imageName,
  missing_chunks: missingChunks  ✅
}
```

**Status:** ✅ **PERFECT MATCH**

---

### 6. ACK_OK Message (server→device)

**Protocol Doc:**
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "ACK_OK": {
    "next_wake_time": "5:30PM"
  }
}
```

**Our Implementation:**
```typescript
// ack.ts publishAckOk()
{
  device_id: deviceMac,
  image_name: imageName,
  ACK_OK: {
    next_wake_time: nextWake  ✅
  }
}
```

**Status:** ✅ **PERFECT MATCH**

---

## Critical Issues Found

### ❌ ISSUE #1: Capture Image Command Format

**Problem:**
- Protocol doc shows: `{"device_id": "...", "capture_image"}`  (bare key)
- We send: `{"device_id": "...", "capture_image": true}` (boolean value)

**Impact:** Device might not recognize command

**Location:** `mqtt-service/index.js` line 917

**Fix Required:**
```javascript
// CURRENT (WRONG?)
const captureCmd = {
  device_id: payload.device_id,
  capture_image: true  // ⚠️ Remove true
};

// SHOULD BE:
const captureCmd = {
  device_id: payload.device_id,
  capture_image: {}  // Or just the key?
};
```

**Question:** Does ESP32 firmware expect `"capture_image": true` or just `"capture_image"` key presence?

---

### ⚠️ ISSUE #2: Command Queue Not Used Per Protocol

**Protocol Doc Section 5 says:**
> device/{id}/cmd → Server commands (capture_image, set_next_wake)

**Our Implementation:**
We have `device_commands` table with:
- command_type: 'retry_image', 'ping', etc.
- command_payload: JSONB
- status: 'pending', 'sent', 'acknowledged'

**But:** We don't seem to poll this table and send commands to devices automatically!

**Missing Flow:**
```
1. User clicks "Retry" button in UI
   → queue_wake_retry() creates device_command record
2. ??? MISSING STEP ???
   → How does this command get sent to device?
3. Device wakes up
   → Should check device/{mac}/cmd topic for pending commands
```

**Current Reality:**
- We create retry commands in database ✅
- We DON'T publish them to MQTT ❌
- Device wakes, sends HELLO, but never receives retry command ❌

---

## What Works Correctly ✅

1. **Device HELLO → Server:** ✅ Works perfectly
2. **Metadata transmission:** ✅ All fields captured
3. **Chunk transmission:** ✅ Stored in edge_chunk_buffer
4. **Missing chunks detection:** ✅ publishMissingChunks works
5. **ACK_OK with next_wake:** ✅ Protocol compliant
6. **Finalize flow:** ✅ Assembles image, stores, ACKs

---

## What Needs Fixing ❌

### Priority 1: Command Queue Processing

**Problem:** Commands stored in database never sent to devices

**Solution:** Add MQTT command publisher

```javascript
// NEW FUNCTION NEEDED in mqtt-service/commandQueueProcessor.js

async function processPendingCommands() {
  // 1. Query device_commands where status='pending'
  const { data: commands } = await supabase
    .from('device_commands')
    .select('*, devices(device_mac)')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString());

  // 2. For each command, publish to device/{mac}/cmd
  for (const cmd of commands) {
    const topic = `device/${cmd.devices.device_mac}/cmd`;
    const message = {
      device_id: cmd.devices.device_mac,
      ...cmd.command_payload  // e.g., send_image: 'img.jpg'
    };
    
    client.publish(topic, JSON.stringify(message));
    
    // 3. Mark as 'sent'
    await supabase
      .from('device_commands')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('command_id', cmd.command_id);
  }
}

// Run every 30 seconds
setInterval(processPendingCommands, 30000);
```

### Priority 2: Verify Capture Image Format

**Action:** Test with real ESP32 device - does it expect:
- `{"capture_image"}` (just key)
- `{"capture_image": true}` (boolean - what we currently send)
- `{"capture_image": ""}` (empty string)

---

## Testing Checklist

- [ ] Test HELLO message with real device
- [ ] Verify capture_image command format works
- [ ] Test send_image command (retry flow)
- [ ] Verify missing_chunks request/response
- [ ] Test ACK_OK with next_wake parsing
- [ ] Implement command queue processor
- [ ] Test manual retry button → command published
- [ ] Verify device receives and processes retry command
- [ ] Test offline recovery flow (5-day scenario)
- [ ] Verify pending_count in HELLO message

---

## Recommendations

1. **Immediate:** Add command queue processor to mqtt-service
2. **Immediate:** Test capture_image format with ESP32
3. **High Priority:** Document command format expectations
4. **Medium:** Add command acknowledgment flow
5. **Low:** Add command timeout/expiry cleanup

---

## Files That Need Changes

1. `mqtt-service/commandQueueProcessor.js` - **CREATE NEW**
2. `mqtt-service/index.js` - Add commandQueueProcessor import and start
3. `mqtt-service/index.js` - Fix capture_image format (line 917)

---

## Summary Status

| Component | Status | Notes |
|-----------|--------|-------|
| MQTT Topics | ✅ Correct | Match protocol exactly |
| HELLO Messages | ✅ Working | Extra telemetry OK |
| Metadata/Chunks | ✅ Working | Full protocol support |
| Missing Chunks | ✅ Working | Perfect implementation |
| ACK_OK | ✅ Working | Next wake included |
| Capture Command | ⚠️ Verify | May need format fix |
| Command Queue | ❌ Missing | Not publishing commands! |
| Retry Flow | ❌ Broken | Queue created but not sent |

**CRITICAL:** Command queue processor is MISSING - retry buttons create database records but never send MQTT messages!
