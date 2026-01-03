# ESP32-CAM MQTT Protocol Complete Implementation Guide

## Overview

This guide documents the complete, protocol-compliant MQTT implementation for ESP32-CAM devices per the BrainlyTree ESP32CAM Architecture Document specification.

---

## Table of Contents

1. [Critical Protocol Rules](#critical-protocol-rules)
2. [Field Name Mappings](#field-name-mappings)
3. [Message Types & Formats](#message-types--formats)
4. [Topic Structure](#topic-structure)
5. [Complete Message Flow](#complete-message-flow)
6. [Implementation Checklist](#implementation-checklist)
7. [Testing Protocol Compliance](#testing-protocol-compliance)

---

## Critical Protocol Rules

### 1. **Firmware Field Names Are CONCRETE**
- Field names in MQTT messages MUST match firmware exactly
- Case-sensitive: `pendingImg` (NOT `pendingimg` or `pending_img`)
- Firmware cannot be changed without reflashing 100+ devices
- **Database field names can differ** - use mapping layer

### 2. **Topic Routing**
```
Device publishes to:
- ESP32CAM/{macID}/status  → HELLO messages
- ESP32CAM/{macID}/data    → METADATA & CHUNK messages

Server publishes to:
- ESP32CAM/{macID}/cmd     → CAPTURE_IMAGE, SEND_IMAGE, NEXT_WAKE, MISSING_CHUNKS
- ESP32CAM/{macID}/ack     → ACK_OK messages
```

### 3. **Field Name Differences**
- **ACK_OK context**: Uses `next_wake_time` (inside ACK_OK object)
- **CMD context**: Uses `next_wake` (standalone command)
- **Pending images**: `pendingImg` (camelCase, NOT snake_case)
- **Total chunks**: `total_chunks_count` (PLURAL, not `total_chunk_count`)
- **Capture timestamp**: `capture_timestamp` (lowercase 's', not `capture_timeStamp`)

---

## Field Name Mappings

### Database → Protocol Mapping

| Database Field | Protocol Field (MQTT) | Notes |
|---|---|---|
| `mac_address` | `device_id` | Device identifier |
| `pending_image_count` | `pendingImg` | camelCase! |
| `captured_at` | `capture_timestamp` | lowercase |
| `image_size_bytes` | `image_size` | - |
| `chunk_size` | `max_chunk_size` | - |
| `total_chunks` | `total_chunks_count` | PLURAL |
| `chunk_number` | `chunk_id` | - |
| `chunk_data` | `payload` | - |
| `next_wake_time` | `next_wake` OR `next_wake_time` | Context-dependent! |
| `error_code` | `error` | - |

---

## Message Types & Formats

### 1. HELLO Message (Device → Server)

**Topic**: `ESP32CAM/{macID}/status`

**Device Sends**:
```json
{
  "device_id": "esp32-cam-01",
  "status": "alive",
  "pendingImg": 3
}
```

**Field Requirements**:
- `device_id`: string (MAC address) - **REQUIRED**
- `status`: string ("alive") - **REQUIRED**
- `pendingImg`: integer (count) - **REQUIRED** (can be 0)

**Server Response** (if pendingImg > 0):
→ Send ACK_OK with `next_wake_time` (see ACK_OK format below)

---

### 2. CAPTURE_IMAGE Command (Server → Device)

**Topic**: `ESP32CAM/{macID}/cmd`

**Server Sends**:
```json
{
  "device_id": "esp32-cam-01",
  "capture_image": true
}
```

**Field Requirements**:
- `device_id`: string - **REQUIRED**
- `capture_image`: boolean - **REQUIRED**

---

### 3. SEND_IMAGE Command (Server → Device)

**Topic**: `ESP32CAM/{macID}/cmd`

**Server Sends**:
```json
{
  "device_id": "esp32-cam-01",
  "send_image": "image_001.jpg"
}
```

**Field Requirements**:
- `device_id`: string - **REQUIRED**
- `send_image`: string (image filename) - **REQUIRED**

---

### 4. NEXT_WAKE Standalone Command (Server → Device)

**Topic**: `ESP32CAM/{macID}/cmd`

**Server Sends**:
```json
{
  "device_id": "esp32-cam-01",
  "next_wake": "5:30PM"
}
```

**Field Requirements**:
- `device_id`: string - **REQUIRED**
- `next_wake`: string (formatted time) - **REQUIRED**

**Time Format**: `H:MMAM/PM` (e.g., "5:30PM", "11:00AM")

---

### 5. METADATA Message (Device → Server)

**Topic**: `ESP32CAM/{macID}/data`

**Device Sends**:
```json
{
  "device_id": "esp32-cam-01",
  "capture_timestamp": "2025-08-29T14:30:00Z",
  "image_name": "image_001.jpg",
  "image_size": 4153,
  "max_chunk_size": 128,
  "total_chunks_count": 15,
  "location": "Room 101",
  "error": 0,
  "temperature": 25.5,
  "humidity": 45.2,
  "pressure": 1010.5,
  "gas_resistance": 15.3
}
```

**Field Requirements**:
- `device_id`: string - **REQUIRED**
- `capture_timestamp`: ISO 8601 string - **REQUIRED**
- `image_name`: string - **REQUIRED**
- `image_size`: integer (bytes) - **REQUIRED**
- `max_chunk_size`: integer (bytes) - **REQUIRED**
- `total_chunks_count`: integer - **REQUIRED** (note: PLURAL!)
- `error`: integer (0 = success) - **REQUIRED**
- `location`: string - OPTIONAL
- `temperature`: float - OPTIONAL
- `humidity`: float - OPTIONAL
- `pressure`: float - OPTIONAL
- `gas_resistance`: float - OPTIONAL

---

### 6. CHUNK Message (Device → Server)

**Topic**: `ESP32CAM/{macID}/data`

**Device Sends**:
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "chunk_id": 1,
  "max_chunk_size": 128,
  "payload": [255, 216, 255, 224, ...]
}
```

**Field Requirements**:
- `device_id`: string - **REQUIRED**
- `image_name`: string - **REQUIRED**
- `chunk_id`: integer (1-indexed) - **REQUIRED**
- `max_chunk_size`: integer - **REQUIRED**
- `payload`: array of bytes - **REQUIRED**

---

### 7. ACK_OK Message (Server → Device)

**Topic**: `ESP32CAM/{macID}/ack`

**Server Sends**:
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "ACK_OK": {
    "next_wake_time": "5:30PM"
  }
}
```

**Field Requirements**:
- `device_id`: string - **REQUIRED**
- `image_name`: string - **REQUIRED**
- `ACK_OK`: object - **REQUIRED**
  - `next_wake_time`: string (formatted time) - **REQUIRED**

**IMPORTANT**:
- `ACK_OK` is an object containing `next_wake_time`
- Use `next_wake_time` here (NOT `next_wake`)
- This is different from standalone NEXT_WAKE command

---

### 8. MISSING_CHUNKS Request (Server → Device)

**Topic**: `ESP32CAM/{macID}/cmd` ⚠️ **NOT `/ack`**

**Server Sends**:
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "missing_chunks": [5, 10, 23]
}
```

**Field Requirements**:
- `device_id`: string - **REQUIRED**
- `image_name`: string - **REQUIRED**
- `missing_chunks`: array of integers - **REQUIRED**

**IMPORTANT**: This goes to **CMD topic**, not ACK topic!

---

## Complete Message Flow

### Scenario 1: Normal Wake Cycle (Online)

```
1. Device wakes up
   └→ Publishes HELLO to ESP32CAM/{macID}/status
      {
        "device_id": "esp32-cam-01",
        "status": "alive",
        "pendingImg": 0
      }

2. Server responds with CAPTURE_IMAGE to ESP32CAM/{macID}/cmd
      {
        "device_id": "esp32-cam-01",
        "capture_image": true
      }

3. Device captures image & sensor data
   └→ Publishes METADATA to ESP32CAM/{macID}/data
      {
        "device_id": "esp32-cam-01",
        "capture_timestamp": "2025-01-03T10:00:00Z",
        "image_name": "img_20250103_100000.jpg",
        "image_size": 45120,
        "max_chunk_size": 1024,
        "total_chunks_count": 45,
        "error": 0,
        "temperature": 22.5,
        "humidity": 50.2,
        "pressure": 1013.2,
        "gas_resistance": 120.5
      }

4. Server receives metadata, responds with SEND_IMAGE to ESP32CAM/{macID}/cmd
      {
        "device_id": "esp32-cam-01",
        "send_image": "img_20250103_100000.jpg"
      }

5. Device sends all 45 chunks to ESP32CAM/{macID}/data
      {
        "device_id": "esp32-cam-01",
        "image_name": "img_20250103_100000.jpg",
        "chunk_id": 1,
        "max_chunk_size": 1024,
        "payload": [255, 216, ...]
      }
      (repeat for chunks 2-45)

6a. IF ALL CHUNKS RECEIVED → Server sends ACK_OK to ESP32CAM/{macID}/ack
      {
        "device_id": "esp32-cam-01",
        "image_name": "img_20250103_100000.jpg",
        "ACK_OK": {
          "next_wake_time": "2:00PM"
        }
      }

6b. IF CHUNKS MISSING → Server sends MISSING_CHUNKS to ESP32CAM/{macID}/cmd
      {
        "device_id": "esp32-cam-01",
        "image_name": "img_20250103_100000.jpg",
        "missing_chunks": [5, 12, 34]
      }
   └→ Device resends missing chunks 5, 12, 34
   └→ Server validates and sends ACK_OK (go to step 6a)

7. Device calculates sleep duration until 2:00PM
   └→ Enters deep sleep
```

---

### Scenario 2: Device Has Pending Images (Offline Recovery)

```
1. Device wakes up after being offline
   └→ Publishes HELLO to ESP32CAM/{macID}/status
      {
        "device_id": "esp32-cam-01",
        "status": "alive",
        "pendingImg": 3
      }

2. Server sees pendingImg > 0
   └→ Sends ACK_OK with instruction to send first pending image
      {
        "device_id": "esp32-cam-01",
        "image_name": "img_20250102_080000.jpg",
        "ACK_OK": {
          "next_wake_time": "10:30AM"
        }
      }

3. Device sends METADATA for oldest pending image
   └→ Follow normal flow (METADATA → SEND_IMAGE → CHUNKs → ACK_OK)

4. After ACK_OK, server issues new CAPTURE_IMAGE for current wake
   └→ Device captures new image and sends it

5. Repeat until all pending images cleared
   └→ Device goes to sleep with updated next_wake
```

---

## Implementation Checklist

### Phase 1: Database & Logging ✅

- [ ] Apply `MQTT_PROTOCOL_COMPLIANCE_MIGRATION.sql` to database
  - Creates `mqtt_messages` table for traffic logging
  - Creates `mqtt_protocol_fields` reference table
  - Adds `firmware_version` and `protocol_version` to devices table
  - Creates helper functions for logging and validation

### Phase 2: Protocol Module ✅

- [x] Created `protocol.ts` module with:
  - Protocol field constants
  - Message builders (with correct field names)
  - Message parsers (handling protocol → database mapping)
  - Validation functions
  - Time formatting helpers

### Phase 3: MQTT Handler Updates (NEXT)

- [ ] Update `mqtt_device_handler/index.ts` to use protocol module
- [ ] Replace all hardcoded field names with `PROTOCOL_FIELDS` constants
- [ ] Use correct topics per protocol spec
- [ ] Send MISSING_CHUNKS to `/cmd` topic (not `/ack`)
- [ ] Handle `pendingImg` > 0 case per spec
- [ ] Log all MQTT traffic to `mqtt_messages` table

### Phase 4: Format Compliance

- [ ] Implement time formatting per spec (H:MMAM/PM format)
- [ ] Use `next_wake` for standalone commands
- [ ] Use `next_wake_time` inside ACK_OK objects
- [ ] Handle telemetry-only wakes (device flexibility)
- [ ] Validate outbound messages before sending

### Phase 5: Testing

- [ ] Test HELLO with pendingImg = 0 (normal wake)
- [ ] Test HELLO with pendingImg > 0 (offline recovery)
- [ ] Test complete image transmission with retry
- [ ] Test missing chunks request/resend flow
- [ ] Test telemetry-only wake (camera malfunction scenario)
- [ ] Verify MQTT message logging works
- [ ] Check field name compliance with validator

---

## Testing Protocol Compliance

### Use the Database Validator

```sql
-- Validate an outbound ACK_OK message
SELECT * FROM validate_mqtt_message(
  'ack_ok',
  'server_to_device',
  '{
    "device_id": "esp32-cam-01",
    "image_name": "test.jpg",
    "ACK_OK": {"next_wake_time": "5:30PM"}
  }'::jsonb
);
```

Expected result:
```
is_valid | missing_required_fields | unknown_fields
---------|------------------------|----------------
true     | {}                     | {}
```

### Check Protocol Field Mappings

```sql
-- See all required fields for HELLO message
SELECT * FROM get_mqtt_field_mapping('hello', 'device_to_server');
```

### Monitor MQTT Traffic

```sql
-- View recent messages
SELECT * FROM mqtt_traffic_recent LIMIT 50;

-- Check for protocol violations
SELECT * FROM mqtt_protocol_issues;
```

### Test Message Builders

```typescript
import {
  buildAckOk,
  buildMissingChunksRequest,
  formatNextWakeTime,
  PROTOCOL_TOPICS
} from './protocol.ts';

// Build ACK_OK
const ackOk = buildAckOk({
  macAddress: 'esp32-cam-01',
  imageName: 'test.jpg',
  nextWakeTime: '5:30PM'
});

console.log(ackOk);
// {
//   "device_id": "esp32-cam-01",
//   "image_name": "test.jpg",
//   "ACK_OK": {
//     "next_wake_time": "5:30PM"
//   }
// }

// Get correct topic
const ackTopic = PROTOCOL_TOPICS.ACK('esp32-cam-01');
console.log(ackTopic); // "ESP32CAM/esp32-cam-01/ack"
```

---

## Key Differences from Previous Implementation

| Aspect | Previous | Protocol-Compliant |
|--------|----------|-------------------|
| Pending images field | `pending_images` or `pendingImages` | `pendingImg` (exact case) |
| Total chunks field | `total_chunk_count` | `total_chunks_count` (plural) |
| Capture timestamp | Various | `capture_timestamp` (lowercase) |
| Missing chunks topic | `/ack` | `/cmd` |
| ACK_OK format | `next_wake` | Nested `ACK_OK: {next_wake_time}` |
| Standalone wake cmd | `next_wake_time` | `next_wake` |
| HELLO with pending | No response | Must send ACK_OK |
| Time format | ISO 8601 | `H:MMAM/PM` string |

---

## Common Pitfalls

### ❌ Wrong: Case Mismatch
```json
{
  "device_id": "esp32-cam-01",
  "pendingimg": 3  // WRONG! Should be "pendingImg"
}
```

### ❌ Wrong: Field Name
```json
{
  "device_id": "esp32-cam-01",
  "total_chunk_count": 15  // WRONG! Should be "total_chunks_count" (plural)
}
```

### ❌ Wrong: Topic
```javascript
// Sending MISSING_CHUNKS to ACK topic
mqttClient.publish(`ESP32CAM/${macId}/ack`, missingChunksMsg);  // WRONG!
```

### ✅ Correct
```javascript
// MISSING_CHUNKS goes to CMD topic
mqttClient.publish(`ESP32CAM/${macId}/cmd`, missingChunksMsg);  // CORRECT
```

### ❌ Wrong: ACK_OK Format
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "test.jpg",
  "next_wake_time": "5:30PM"  // WRONG! Must be nested in ACK_OK
}
```

### ✅ Correct: ACK_OK Format
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "test.jpg",
  "ACK_OK": {
    "next_wake_time": "5:30PM"  // CORRECT! Nested structure
  }
}
```

---

## Quick Reference Card

### Protocol Field Names (Copy-Paste Safe)

```typescript
// Device identifier
"device_id"

// HELLO fields
"status"
"pendingImg"  // ⚠️ camelCase!

// METADATA fields
"capture_timestamp"  // ⚠️ lowercase 's'
"image_name"
"image_size"
"max_chunk_size"
"total_chunks_count"  // ⚠️ PLURAL!
"location"
"error"
"temperature"
"humidity"
"pressure"
"gas_resistance"

// CHUNK fields
"chunk_id"
"payload"

// ACK fields
"ACK_OK"  // Object containing next_wake_time
"next_wake_time"  // Inside ACK_OK

// CMD fields
"capture_image"
"send_image"
"next_wake"  // Standalone command
"missing_chunks"  // Array
```

### Topics

```
Device → Server:
  ESP32CAM/{macID}/status
  ESP32CAM/{macID}/data

Server → Device:
  ESP32CAM/{macID}/cmd  ← commands & missing_chunks
  ESP32CAM/{macID}/ack  ← ACK_OK only
```

---

## Next Steps

1. **Apply database migration**: Run `MQTT_PROTOCOL_COMPLIANCE_MIGRATION.sql`
2. **Update MQTT handler**: Integrate `protocol.ts` module
3. **Test with simulator**: Use test scripts to verify compliance
4. **Deploy to production**: Update edge functions
5. **Monitor logs**: Watch `mqtt_messages` table for violations

---

## Support & Questions

For protocol questions, refer to:
- BrainlyTree ESP32CAM Architecture Document (PDF)
- `mqtt_protocol_fields` table (field reference)
- `protocol.ts` module (implementation)

Protocol violations will be logged to `mqtt_protocol_issues` view for debugging.
