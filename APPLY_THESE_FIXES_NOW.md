# CRITICAL FIXES - APPLY NOW

## Issue 1: Roboflow Trigger Not Working

### Root Cause
Trigger failing with: `"unrecognized configuration parameter 'app.supabase_url'"`
Found in `async_error_logs` - trigger IS firing but can't call edge function.

### Fix
Apply this SQL in Supabase Dashboard → SQL Editor:

```sql
-- See: /tmp/fix_roboflow_trigger.sql
```

Copy the contents of `/tmp/fix_roboflow_trigger.sql` to Supabase Dashboard and execute.

---

## Issue 2: New device_images Missing Context

### Root Cause
New `device_images` records created without `site_id`, `program_id`, `site_device_session_id`

### Diagnosis Needed
Need to check which trigger/function is creating device_images and ensure it inherits context properly.

### Action Required
Run this diagnostic:

```sql
-- Check recent device_images without context
SELECT
  image_id,
  device_id,
  site_id,
  program_id,
  site_device_session_id,
  created_at
FROM device_images
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;

-- Check trigger that creates device_images
SELECT 
  tgname,
  pg_get_triggerdef(oid) as definition
FROM pg_trigger
WHERE tgrelid = 'device_images'::regclass;
```

---

## Issue 3: MQTT Protocol - Wrong device_id

### Root Cause
Device sends MAC: `TEST-ESP32-002`
System logs show: `TEST:DE:VI:CE:00:01`

Per architecture document (BrainlyTree_ESP32CAM_AWS_V4.pdf):
- MQTT topic format: `device/{id}/status` where `{id}` = device MAC address
- JSON field `"device_id"` = device MAC address (e.g., "esp32-cam-01")

### Current Implementation Issue
The MQTT handler may be:
1. Not parsing device_id from topic correctly
2. Using wrong field from payload
3. Hardcoded device_id somewhere

### Files to Check
- `supabase/functions/mqtt_device_handler/index.ts` line 37: `const deviceMac = topic.split('/')[1];`
- `supabase/functions/mqtt_device_handler/ingest.ts` line 63: Logs `payload.device_id`

### Protocol Per Document

**Status Message (Page 4):**
```json
{
  "device_id": "esp32-cam-01",
  "status": "alive",
  "pendingImg": 1
}
```

**Metadata Message (Page 4):**
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

**Chunk Payload (Page 5):**
```json
{
  "device_id": "esp32-cam-01",
  "image_name": "image_001.jpg",
  "chunk_id": 1,
  "max_chunk_size": 30,
  "payload": [255, 216, 255, 224, ...]
}
```

### Current Handler Logic (ingest.ts line 58-84)
```typescript
export async function handleHelloStatus(
  supabase: SupabaseClient,
  client: MqttClient,
  payload: DeviceStatusMessage
): Promise<void> {
  console.log('[Ingest] HELLO from device:', payload.device_id, 'MAC:', payload.device_mac, 'pending:', payload.pending_count || 0);

  // Line 67-69: Uses device_mac OR device_id from payload
  const { data: lineageData } = await supabase.rpc(
    'fn_resolve_device_lineage',
    { p_device_mac: payload.device_mac || payload.device_id }
  );

  // Line 78: Queries by device_mac
  const { data: existingDevice } = await supabase
    .from('devices')
    .select('device_id, device_mac, wake_schedule_cron, company_id')
    .eq('device_mac', payload.device_mac || payload.device_id)
    .maybeSingle();
}
```

### The Issue
The payload has TWO fields:
- `payload.device_id` - MQTT client ID from firmware (like "TEST-ESP32-002")
- `payload.device_mac` - May not exist in current protocol

But the DOCUMENT says only ONE field: `device_id` which IS the MAC address!

### Fix Required
The MQTT handler should:
1. Extract device MAC from topic: `device/{MAC}/status`
2. Use that MAC as the primary identifier
3. Store firmware's reported client_id separately (as `mqtt_client_id`)

**Correct Implementation:**
```typescript
// index.ts line 37
const deviceMac = topic.split('/')[1]; // This is CORRECT

// ingest.ts should use deviceMac, not payload.device_id
export async function handleHelloStatus(
  supabase: SupabaseClient,
  client: MqttClient,
  deviceMac: string,  // ← Pass from topic parsing
  payload: DeviceStatusMessage
): Promise<void> {
  console.log('[Ingest] HELLO from MAC:', deviceMac, 'ClientID:', payload.device_id);

  // Use deviceMac for lookups, store payload.device_id as mqtt_client_id
  const { data: existingDevice } = await supabase
    .from('devices')
    .select('device_id, device_mac')
    .eq('device_mac', deviceMac)  // ← Use MAC from topic
    .maybeSingle();

  // Store firmware client ID separately
  updateData.mqtt_client_id = payload.device_id;
}
```

---

## Summary of Fixes Needed

### 1. Roboflow Trigger (READY TO APPLY)
✅ SQL file created: `/tmp/fix_roboflow_trigger.sql`
✅ Includes service_role_key in vault
✅ Ready to copy/paste to Supabase Dashboard

### 2. Device Images Context (INVESTIGATION NEEDED)
⚠️  Need to identify which function creates device_images without context
⚠️  Check `fn_wake_ingestion_handler` or similar
⚠️  Ensure context inheritance from device → site → program

### 3. MQTT Protocol (CODE FIX NEEDED)
❌ Handler using wrong device_id field
❌ Should use MAC from topic, not payload.device_id
❌ Need to update all handler functions to accept `deviceMac` parameter
❌ Store payload.device_id as `mqtt_client_id` only

---

## Next Steps

1. **IMMEDIATE**: Apply Roboflow trigger fix from `/tmp/fix_roboflow_trigger.sql`

2. **INVESTIGATION**: Run diagnostic queries for device_images context issue

3. **CODE UPDATE**: Fix MQTT handler protocol compliance:
   - Update function signatures to pass `deviceMac` from topic
   - Stop using `payload.device_mac` (doesn't exist in protocol)
   - Use `payload.device_id` only for logging/storage as `mqtt_client_id`

4. **BUILD**: Run `npm run build` after code changes

5. **TEST**: Test with actual device `TEST-ESP32-002`
   - Verify correct MAC used for lookups
   - Verify new device_images have full context
   - Verify Roboflow trigger works

