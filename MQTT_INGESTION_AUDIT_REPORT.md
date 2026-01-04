# MQTT Ingestion Pipeline Audit Report

## Date: 2026-01-04
## Purpose: Verify environmental data flows into device_images.metadata

---

## 🔍 Executive Summary

The MQTT ingestion pipeline (`mqtt_device_handler`) currently stores environmental data in `device_wake_payloads` table during HELLO message processing. This audit verifies whether this data properly flows into `device_images.metadata` when images are created.

---

## ✅ What's Working

### 1. Environmental Data Capture in Wake Payloads

**Location:** `supabase/functions/mqtt_device_handler/ingest.ts` (lines 246-252)

The MQTT handler correctly extracts and stores environmental data:

```typescript
await supabase
  .from('device_wake_payloads')
  .insert({
    temperature: payload.temperature,
    humidity: payload.humidity,
    pressure: payload.pressure,
    gas_resistance: payload.gas_resistance,
    battery_voltage: payload.battery_voltage,
    wifi_rssi: payload.wifi_rssi,
    telemetry_data: payload,  // Full payload as JSONB
    // ... other fields
  })
```

**Status:** ✅ Working correctly

---

## ⚠️  Areas Requiring Verification

### 1. device_images.metadata Population

**Question:** When `device_images` records are created, is the `metadata` field populated with environmental data from `device_wake_payloads`?

**Expected Flow:**
```
MQTT HELLO → device_wake_payloads → device_images.metadata
                 (temperature,         (JSONB with all
                  humidity, etc)        environmental data)
```

**Verification Needed:**

1. Check if there's a database trigger or function that populates `device_images.metadata` when images are created
2. Verify the `metadata` JSONB structure matches expected format:
   ```json
   {
     "temperature": 25.5,
     "humidity": 60.2,
     "pressure": 1013.25,
     "gas_resistance": 123456,
     "battery_voltage": 4.2,
     "wifi_rssi": -45
   }
   ```

3. Test with actual data:
   ```sql
   SELECT
     image_id,
     captured_at,
     metadata,
     temperature,  -- computed column
     humidity,     -- computed column
     wake_payload_id
   FROM device_images
   WHERE status = 'complete'
   ORDER BY captured_at DESC
   LIMIT 10;
   ```

**Action Required:**
- Run the SQL query above to verify `metadata` is populated
- Check if computed columns (`temperature`, `humidity`, etc.) are auto-populating from metadata
- Verify `wake_payload_id` foreign key links images to wake payloads

---

## 🔧 Recommended Verification Steps

### Step 1: Check Current Data

```bash
# Run validation script
node validate-device-images-migration.mjs
```

This will show:
- How many device_images have metadata populated
- How many have computed columns populated
- Sample data with environmental readings

### Step 2: Check Database Triggers

Look for triggers that populate `device_images.metadata`:

```sql
SELECT
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'device_images'
  OR event_object_table = 'device_wake_payloads';
```

### Step 3: Trace Image Creation Flow

Find where `device_images` records are created:

1. Check MQTT handler edge function
2. Check database triggers on `device_wake_payloads`
3. Check any RPC functions that create images

---

## 📊 Data Integrity Checks

### Required Validations

1. **Linkage Verification:**
   ```sql
   -- Verify all device_images with wake_payload_id have environmental data
   SELECT
     COUNT(*) as total,
     COUNT(metadata) as with_metadata,
     COUNT(temperature) as with_temp
   FROM device_images
   WHERE wake_payload_id IS NOT NULL;
   ```

2. **Metadata Structure Verification:**
   ```sql
   -- Check metadata JSONB structure
   SELECT DISTINCT
     jsonb_object_keys(metadata) as metadata_keys
   FROM device_images
   WHERE metadata IS NOT NULL
   LIMIT 20;
   ```

3. **Computed Columns Verification:**
   ```sql
   -- Verify computed columns match metadata values
   SELECT
     image_id,
     temperature as computed_temp,
     (metadata->>'temperature')::numeric as metadata_temp,
     CASE
       WHEN temperature = (metadata->>'temperature')::numeric THEN 'MATCH'
       ELSE 'MISMATCH'
     END as validation
   FROM device_images
   WHERE metadata IS NOT NULL
   LIMIT 10;
   ```

---

## 🎯 Expected Outcomes

After verification, we should confirm:

1. ✅ 95%+ of `device_images` rows have `metadata` populated
2. ✅ Computed columns (`temperature`, `humidity`, etc.) correctly extract from `metadata`
3. ✅ `wake_payload_id` foreign key links images to environmental data
4. ✅ JSONB structure in `metadata` is consistent and complete
5. ✅ No orphaned environmental data (wake_payloads without corresponding images)

---

## 🚨 If Issues Found

### Scenario A: metadata Field is NULL

**Problem:** `device_images.metadata` is not being populated during image creation

**Solution:** Create database trigger or update MQTT handler to populate metadata:

```sql
-- Example trigger to populate metadata from wake_payload
CREATE OR REPLACE FUNCTION populate_device_image_metadata()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.wake_payload_id IS NOT NULL AND NEW.metadata IS NULL THEN
    -- Fetch environmental data from wake_payload
    SELECT jsonb_build_object(
      'temperature', wp.temperature,
      'humidity', wp.humidity,
      'pressure', wp.pressure,
      'gas_resistance', wp.gas_resistance,
      'battery_voltage', wp.battery_voltage,
      'wifi_rssi', wp.wifi_rssi
    )
    INTO NEW.metadata
    FROM device_wake_payloads wp
    WHERE wp.payload_id = NEW.wake_payload_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_populate_device_image_metadata
BEFORE INSERT OR UPDATE ON device_images
FOR EACH ROW
EXECUTE FUNCTION populate_device_image_metadata();
```

### Scenario B: Computed Columns Not Working

**Problem:** `temperature`, `humidity` computed columns are NULL even though metadata is populated

**Solution:** Verify computed column definitions and metadata JSONB structure:

```sql
-- Check computed column definition
SELECT column_name, generation_expression
FROM information_schema.columns
WHERE table_name = 'device_images'
  AND is_generated = 'ALWAYS';
```

---

## ✅ Sign-Off Criteria

Before marking MQTT audit as complete, verify:

- [ ] Validation script shows >95% data quality
- [ ] Computed columns are populated correctly
- [ ] No data integrity issues found
- [ ] LOCF function works with real data
- [ ] Frontend components display environmental data correctly

---

## 📝 Notes

- Environmental data originates from ESP32-CAM BME680 sensor
- Data flows through MQTT → wake_payloads → device_images
- Computed columns provide fast indexed access to environmental metrics
- LOCF helper function fills gaps for missed wake cycles

---

**Next Steps:**
1. Run `node validate-device-images-migration.mjs`
2. Execute SQL verification queries above
3. Fix any issues found
4. Re-run validation
5. Mark audit complete
