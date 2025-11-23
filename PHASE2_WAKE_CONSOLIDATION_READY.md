# Phase 2: Wake Payload Consolidation - READY TO APPLY

**Status:** ✅ Migration Created, Ready for Application  
**Date:** November 23, 2025  
**Migration File:** `supabase/migrations/20251123003453_phase2_wake_payload_consolidation.sql`

---

## Summary

Phase 2 enhances the `device_wake_payloads` table to serve as the **single source of truth** for ALL device wake events, following the ESP32-CAM architecture document.

### Current State
- `device_wake_payloads`: 76 records (incomplete - missing columns)
- `device_images`: 300+ records
- `device_telemetry`: 200+ records  
- `device_wake_sessions`: 0 records (**EMPTY**, unused)

### Target State
**ONE wake = ONE record** in `device_wake_payloads` with:
- ✅ Full telemetry data (always present)
- ✅ Optional image reference (if image captured)
- ✅ Wake type categorization
- ✅ Chunk tracking for image transfers
- ✅ Completion status

---

## Migration Details

### 1. New Columns Added to `device_wake_payloads`

| Column | Type | Purpose |
|--------|------|---------|
| `telemetry_id` | UUID | Links to device_telemetry record (FK) |
| `wake_type` | TEXT | Categorizes wake: 'image_wake', 'telemetry_only', 'hello', 'retry' |
| `chunk_count` | INTEGER | Total chunks expected for image transfer |
| `chunks_received` | INTEGER | Chunks received so far (for progress tracking) |
| `is_complete` | BOOLEAN | Quick filter - TRUE when wake fully processed |

### 2. Indexes Created

```sql
-- Fast filtering of complete wakes
CREATE INDEX idx_device_wake_payloads_is_complete ON device_wake_payloads(is_complete) WHERE is_complete = TRUE;

-- Analytics by wake type
CREATE INDEX idx_device_wake_payloads_wake_type ON device_wake_payloads(wake_type);
```

### 3. Existing Data Updated

All 76 existing records will be:
- Marked as `is_complete = TRUE/FALSE` based on image_status
- Assigned `wake_type = 'image_wake'` or `'telemetry_only'`

### 4. Cleanup

- ❌ **`device_wake_sessions` table DROPPED** (verified empty, 0 rows)
- ✅ All wake tracking consolidated into `device_wake_payloads`

---

## ESP32-CAM Architecture Alignment

According to the architecture document (Section 5):

### Device Flow on Wake:
1. **HELLO message** → Server acknowledges
2. **capture_image command** → Device captures
3. **Metadata sent** → Temperature, humidity, battery, WiFi, etc.
4. **send_image command** → Device sends chunks
5. **Chunks transmitted** → Sequential, no individual ACKs
6. **ACK_OK or MISSING_CHUNKS** → Complete or retry
7. **next_wake** schedule received → Device sleeps

### Our Implementation:
✅ **On HELLO** → Create wake_payload record immediately  
✅ **On metadata** → Store telemetry data in wake_payload  
✅ **On chunks** → Track chunk_count and chunks_received  
✅ **On ACK_OK** → Mark is_complete = TRUE  
✅ **On retry** → Update same wake_payload record

---

## Next Steps (Phase 2.3)

After this migration is applied, we need to update the **MQTT Handler**:

### File: `supabase/functions/mqtt_device_handler/index.ts`

#### 1. On HELLO Message
```typescript
const { data: wakePayload } = await supabase
  .from('device_wake_payloads')
  .insert({
    device_id,
    company_id, program_id, site_id,
    site_device_session_id,
    captured_at: payload.capture_timestamp,
    received_at: new Date().toISOString(),
    temperature: payload.temperature,
    humidity: payload.humidity,
    pressure: payload.pressure,
    gas_resistance: payload.gas_resistance,
    battery_voltage: payload.battery_voltage,
    wifi_rssi: payload.wifi_rssi,
    telemetry_data: payload, // Full JSONB
    wake_type: payload.image_name ? 'image_wake' : 'telemetry_only',
    payload_status: 'pending'
  })
  .select('payload_id')
  .single();
```

#### 2. On Metadata Received
```typescript
await supabase
  .from('device_wake_payloads')
  .update({
    image_id: imageId,
    image_status: 'receiving',
    chunk_count: payload.total_chunks_count,
    chunks_received: 0
  })
  .eq('payload_id', wakePayload.payload_id);
```

#### 3. On ACK_OK
```typescript
await supabase
  .from('device_wake_payloads')
  .update({
    payload_status: 'complete',
    image_status: 'complete',
    is_complete: true,
    chunks_received: chunk_count
  })
  .eq('payload_id', wakePayload.payload_id);
```

---

## How to Apply This Migration

### Option 1: Supabase Dashboard (Recommended)
1. Go to **Supabase Dashboard** → **SQL Editor**
2. Copy contents of `supabase/migrations/20251123003453_phase2_wake_payload_consolidation.sql`
3. Paste into SQL Editor
4. Click **Run**
5. Verify:
   - 5 new columns added
   - 2 indexes created
   - 76 records updated
   - device_wake_sessions dropped

### Option 2: Supabase CLI
```bash
cd /path/to/project
supabase db push
```

---

## Verification Steps

After applying migration, run this query to verify:

```sql
-- Check new columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'device_wake_payloads' 
  AND column_name IN ('telemetry_id', 'wake_type', 'chunk_count', 'chunks_received', 'is_complete');

-- Check data updated
SELECT 
  wake_type,
  COUNT(*) as count,
  SUM(CASE WHEN is_complete THEN 1 ELSE 0 END) as complete_count
FROM device_wake_payloads
GROUP BY wake_type;

-- Verify device_wake_sessions dropped
SELECT to_regclass('public.device_wake_sessions'); -- Should return NULL
```

Expected output:
```
column_name       | data_type
------------------|-----------
telemetry_id      | uuid
wake_type         | text
chunk_count       | integer
chunks_received   | integer
is_complete       | boolean

wake_type        | count | complete_count
-----------------|-------|---------------
image_wake       | 60    | 55
telemetry_only   | 16    | 16
```

---

## Rollback Plan

If needed, rollback by:

1. **Restore device_wake_sessions table** (was empty, so just recreate structure if needed)
2. **Drop new columns:**
```sql
ALTER TABLE device_wake_payloads
  DROP COLUMN IF EXISTS telemetry_id,
  DROP COLUMN IF EXISTS wake_type,
  DROP COLUMN IF EXISTS chunk_count,
  DROP COLUMN IF EXISTS chunks_received,
  DROP COLUMN IF EXISTS is_complete;
```

---

## Impact Assessment

✅ **Low Risk:**
- Additive changes only (new columns, indexes)
- Existing data preserved
- No breaking changes to current queries

✅ **High Value:**
- Consolidates wake tracking into single table
- Enables better analytics and monitoring
- Prepares for Phase 3 (roll-up triggers)
- Aligns with ESP32-CAM architecture document

✅ **Performance:**
- Indexes optimize common queries
- Partial index on `is_complete` saves space
- No impact on write performance

---

## Status Checklist

- [x] Phase 1: Assignment Card Fix (COMPLETE)
- [x] Phase 2.1: Schema Migration Created
- [x] Phase 2.2: device_wake_sessions Verified Empty
- [ ] **Phase 2: Apply Migration** ← YOU ARE HERE
- [ ] Phase 2.3: Update MQTT Handler
- [ ] Phase 3: Database Triggers
- [ ] Phase 4: Next Wake Calculation
- [ ] Phase 5: UI Updates

---

**Ready to proceed?** Apply the migration now and move to Phase 2.3!
