# ESP32-CAM Firmware Protocol Field Mappings

This document defines the field mappings between the ESP32-CAM firmware's MQTT protocol and our backend systems.

**IMPORTANT**: The firmware code (`.cpp` files) is the authoritative source. Our backend must adapt to the firmware's format.

---

## Field Name Mappings

### Metadata Message (Image Information)

The firmware sends image metadata with these field names that differ from our backend expectations:

| Firmware Field | Backend Field | Type | Notes |
|----------------|---------------|------|-------|
| `timestamp` | `capture_timestamp` | string (ISO 8601) | Firmware uses `timestamp`, backend expects `capture_timestamp` |
| `max_chunks_size` | `max_chunk_size` | number | Firmware has 's' at end (`max_chunks_size`), backend expects no 's' (`max_chunk_size`) |
| `total_chunk_count` | `total_chunks_count` | number | Firmware uses singular (`total_chunk_count`), backend expects plural (`total_chunks_count`) |
| `sensor_data` (nested object) | (flat fields) | object | Firmware nests sensor data, backend expects flat structure |

### Sensor Data Structure

**Firmware Format** (from `mqtt_operation.cpp` lines 243-247):
```json
{
  "sensor_data": {
    "temperature": 23.00318,
    "humidity": 52.34259,
    "pressure": 1019.67,
    "gas_resistance": 11.487
  }
}
```

**Backend Expected Format**:
```json
{
  "temperature": 23.00318,
  "humidity": 52.34259,
  "pressure": 1019.67,
  "gas_resistance": 11.487
}
```

**Normalization**: Our backend extracts the nested `sensor_data` object fields and flattens them to the root level.

---

## Complete Firmware Metadata Example

From `mqtt_operation.cpp` `publishMetadata()` function (lines 228-250):

```json
{
  "device_id": "B8F862F9C1C4",
  "timestamp": "2026-02-07T16:33:14Z",
  "image_name": "image_3.jpg",
  "image_id": 3,
  "image_size": 70959,
  "max_chunks_size": 1024,
  "total_chunk_count": 70,
  "location": "office_404",
  "error": 0,
  "sensor_data": {
    "temperature": 23.00318,
    "humidity": 52.34259,
    "pressure": 1019.67,
    "gas_resistance": 11.487
  }
}
```

---

## Image Chunk Format

**Firmware Format** (from `main.cpp` line 149):
```json
{
  "device_id": "B8F862F9C1C4",
  "image_name": "image_3.jpg",
  "chunk_id": 0,
  "max_chunk_size": 1024,
  "payload": "BASE64_ENCODED_STRING_HERE"
}
```

**Key Points**:
- `payload` is a **base64-encoded string** (not a number array)
- Backend must decode base64 to binary before processing
- First chunk (chunk_id=0) should have JPEG header: `FF D8 FF`

---

## Status Message Format

**Firmware Format** (from `mqtt_operation.cpp` lines 107-138):
```json
{
  "device_id": "B8F862F9C1C4",
  "status": "Alive",
  "pendingImg": 2,
  "pending_list": ["image_1.jpg", "image_2.jpg"]
}
```

**Key Points**:
- `pending_list` array is capped at 10 items to prevent oversized MQTT messages
- Backend should UPSERT these into `device_images` table for tracking
- Field can be `pendingImg` or `pending_count` (both supported)

---

## Temperature Units

**CRITICAL**: Temperature handling requires conversion:

- **Firmware Sends**: Celsius (°C) from BME680 sensor
- **Backend Stores**: Fahrenheit (°F) in database
- **Conversion Formula**: `°F = (°C × 1.8) + 32`

**Example**:
- Firmware: `"temperature": 23.00318` (°C)
- Backend stores: `73.41` (°F)

**Implementation**:
- MQTT service: passes through Celsius (for edge function conversion)
- Edge function: converts to Fahrenheit before database insertion
- All alerts and thresholds: configured in Fahrenheit

---

## Normalization Implementation

### MQTT Service (`mqtt-service/index.js`)

The `normalizeMetadataPayload()` function handles firmware-to-backend conversion:

```javascript
function normalizeMetadataPayload(payload) {
  const sensorData = payload.sensor_data || {};

  return {
    ...payload,
    // Field name mappings
    capture_timestamp: payload.timestamp || payload.capture_timestamp,
    max_chunk_size: payload.max_chunks_size || payload.max_chunk_size,
    total_chunks_count: payload.total_chunk_count || payload.total_chunks_count,

    // Extract nested sensor data to flat structure
    temperature: sensorData.temperature ?? payload.temperature,
    humidity: sensorData.humidity ?? payload.humidity,
    pressure: sensorData.pressure ?? payload.pressure,
    gas_resistance: sensorData.gas_resistance ?? payload.gas_resistance,
  };
}
```

### Edge Function (`supabase/functions/mqtt_device_handler/ingest.ts`)

Similar normalization is applied in the edge function to handle both formats:

```typescript
function normalizeMetadataPayload(payload: ImageMetadata): ImageMetadata {
  const sensorData = payload.sensor_data || {};

  return {
    ...payload,
    capture_timestamp: payload.timestamp || payload.capture_timestamp,
    max_chunk_size: payload.max_chunks_size || payload.max_chunk_size,
    total_chunks_count: payload.total_chunk_count || payload.total_chunks_count,
    temperature: sensorData.temperature ?? payload.temperature,
    humidity: sensorData.humidity ?? payload.humidity,
    pressure: sensorData.pressure ?? payload.pressure,
    gas_resistance: sensorData.gas_resistance ?? payload.gas_resistance,
  };
}
```

---

## Backward Compatibility

The normalization functions support **both** firmware and backend formats using the `||` and `??` operators:

- If firmware field exists, use it
- If backend field exists, use it
- Handles both nested and flat sensor data structures

This ensures compatibility with:
- Current firmware (nested `sensor_data`, firmware field names)
- Future firmware updates
- Legacy backend processing that may already use backend format

---

## Testing Checklist

When testing firmware integration:

1. ✅ **Status Message**: Verify `pending_list` array is processed and images created in `device_images`
2. ✅ **Metadata Message**: Confirm all field mappings work (timestamp, chunks, sensor data)
3. ✅ **Sensor Data**: Verify nested `sensor_data` object is correctly extracted
4. ✅ **Chunk Payload**: Confirm base64 decoding works and JPEG headers are valid
5. ✅ **Temperature**: Verify Celsius→Fahrenheit conversion happens correctly
6. ✅ **Database**: Check all records have correct values in expected fields

---

## Firmware Source Files

Reference firmware implementation:
- **mqtt_operation.cpp**: MQTT protocol implementation, metadata publishing
- **main.cpp**: Image capture, chunk sending, state machine
- **Protocol PDF**: High-level protocol documentation (may differ from actual firmware)

**Remember**: When in doubt, the `.cpp` files are authoritative!

---

## Version History

- **2026-02-07**: Initial documentation based on firmware v3.5.0 analysis
- Firmware GitHub: https://github.com/entropybeater/ESP32S3_Cam_seed_studio_VX
