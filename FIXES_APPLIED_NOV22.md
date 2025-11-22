# Fixes Applied - November 22, 2025

## 1. ✅ Roboflow Trigger Fixed (No Vault)

**Migration:** `supabase/migrations/20251122120002_fix_roboflow_trigger_no_vault.sql`

**Problem:**
- Trigger using non-existent `current_setting('app.supabase_url')`
- Vault extension not available in Supabase

**Solution:**
- Created `app_secrets` table with RLS (no direct access)
- Stored service_role_key and supabase_url in table
- Created `get_app_secret()` SECURITY DEFINER function
- Trigger now reads from app_secrets instead of vault

**Status:** Ready to apply in Supabase Dashboard SQL Editor

**Expected Output:**
```
✓ app_secrets table exists
✓ supabase_url configured
✓ service_role_key configured
✓ Trigger recreated successfully
✓ All checks passed - Roboflow auto-scoring is ready
```

---

## 2. ⚠️ Device Images Missing Context - NEEDS INVESTIGATION

**Problem:**
New `device_images` records created without `site_id`, `program_id`, `site_device_session_id`

**Investigation Needed:**
Run these queries to diagnose:

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

-- Check what trigger creates device_images
SELECT 
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  pg_get_triggerdef(oid) as definition
FROM pg_trigger
WHERE tgrelid = 'device_images'::regclass
OR pg_get_triggerdef(oid) LIKE '%device_images%';
```

**Likely Culprits:**
1. `fn_wake_ingestion_handler` - Check if it's inheriting context properly
2. MQTT handler edge function - Check if it's passing context when creating device_images
3. Context inheritance triggers - May not be working correctly

---

## 3. ❌ MQTT Protocol Device ID Issue - CODE FIX NEEDED

**Problem:**
Device sends MAC: `TEST-ESP32-002`
System shows: `TEST:DE:VI:CE:00:01`

**Root Cause:**
Handler is confused between topic MAC and payload fields.

**Per Architecture Document (BrainlyTree_ESP32CAM_AWS_V4.pdf):**
- Topic format: `device/{MAC}/status` where `{MAC}` is device identifier
- Payload `device_id` field = device MAC address (e.g., "esp32-cam-01")
- NO separate `device_mac` field in protocol

**Current Code Issue:**
File: `supabase/functions/mqtt_device_handler/ingest.ts`

```typescript
// WRONG: Uses payload.device_id for lookups
const { data: existingDevice } = await supabase
  .from('devices')
  .select('device_id, device_mac')
  .eq('device_mac', payload.device_mac || payload.device_id)  // ❌
  .maybeSingle();
```

**Correct Implementation:**
```typescript
// RIGHT: Use MAC from topic, store payload.device_id as mqtt_client_id
export async function handleHelloStatus(
  supabase: SupabaseClient,
  client: MqttClient,
  deviceMac: string,  // ← Pass from topic parsing
  payload: DeviceStatusMessage
): Promise<void> {
  // Use deviceMac for all lookups
  const { data: existingDevice } = await supabase
    .from('devices')
    .select('device_id, device_mac')
    .eq('device_mac', deviceMac)  // ✅ Use MAC from topic
    .maybeSingle();

  // Store firmware's reported client ID separately
  updateData.mqtt_client_id = payload.device_id;
}
```

**Files to Update:**
1. `supabase/functions/mqtt_device_handler/index.ts` - Already parses MAC correctly (line 37)
2. `supabase/functions/mqtt_device_handler/ingest.ts` - Update all handler functions
3. `supabase/functions/mqtt_device_handler/types.ts` - Update type definitions

**Changes Required:**
- [ ] Update `handleHelloStatus()` signature to accept `deviceMac` parameter
- [ ] Update `handleMetadata()` to use `deviceMac` from topic
- [ ] Update `handleChunk()` to use `deviceMac` from topic
- [ ] Update `handleTelemetryOnly()` to use `deviceMac` from topic
- [ ] Remove all references to `payload.device_mac` (doesn't exist in protocol)
- [ ] Store `payload.device_id` only as `mqtt_client_id` for logging

---

## Summary

### Ready to Apply
✅ **Roboflow Trigger Fix** - Copy migration to Supabase Dashboard and run

### Needs Investigation
⚠️ **Device Images Context** - Run diagnostic queries to find where context is lost

### Needs Code Changes
❌ **MQTT Protocol** - Update handler functions to follow architecture document

---

## Next Steps

1. Apply migration: `20251122120002_fix_roboflow_trigger_no_vault.sql`
2. Investigate device_images context issue
3. Fix MQTT handler protocol compliance
4. Run `npm run build`
5. Test with device `TEST-ESP32-002`

