# 🔴 CRITICAL FIX REQUIRED: MQTT Image Handler Error

## Problem Summary

**Error Message:**
```
record "new" has no field "site_device_session_id"
```

**Root Cause:**
The `fn_wake_ingestion_handler` SQL function inserts into `device_images` table WITHOUT including required context columns (`program_id`, `site_id`, `site_device_session_id`).

When the database trigger `populate_device_data_company_id()` tries to check `IF NEW.site_device_session_id IS NULL`, PostgreSQL throws an error because that field wasn't included in the INSERT column list.

---

## Why This Happened

### ESP32-CAM Protocol (Per PDF Section 5)
The device sends ONLY these fields:
```json
{
  "device_id": "AA:BB:CC:21:30:20",
  "capture_timestamp": "2025-11-22T16:01:00Z",
  "image_name": "https://...",
  "image_size": 123456,
  "max_chunk_size": 128,
  "total_chunks_count": 5,
  "location": "GH-01-West",
  "error": 0,
  "temperature": 8.9,
  "humidity": 82,
  "pressure": 1009.7,
  "gas_resistance": 15.3,
  "battery_voltage": 3.92,
  "wifi_rssi": -60
}
```

**The device NEVER sends:**
- ❌ `company_id`
- ❌ `program_id`
- ❌ `site_id`
- ❌ `site_device_session_id`

**These must be resolved SERVER-SIDE** from device lineage!

### Current Code Flow

1. **Edge Function (`ingest.ts`)** receives metadata
2. **Calls `fn_resolve_device_lineage()`** → Gets `device_id`, `site_id`, `program_id`, `company_id`
3. **Calls `fn_wake_ingestion_handler()`** → Resolves `session_id`
4. **Inserts into `device_images`** → ❌ **BUG HERE**: Missing columns!
5. **Trigger fires** → Tries to check `NEW.site_device_session_id` → ❌ **ERROR!**

---

## The Fix

### File: `FIX_DEVICE_IMAGES_INSERT.sql`

**Changes to `fn_wake_ingestion_handler` function:**

**BEFORE (❌ BROKEN):**
```sql
INSERT INTO device_images (
  device_id, image_name, captured_at, status,
  total_chunks, metadata, company_id, original_capture_date
) VALUES (
  p_device_id, p_image_name, p_captured_at, 'receiving',
  (p_telemetry_data->>'total_chunks')::INT,
  p_telemetry_data, v_company_id, v_session_date
)
```

**AFTER (✅ FIXED):**
```sql
INSERT INTO device_images (
  device_id, image_name, captured_at, status,
  total_chunks, metadata, company_id, original_capture_date,
  program_id,                    -- ✅ ADD: Resolved from lineage
  site_id,                       -- ✅ ADD: Resolved from lineage
  site_device_session_id         -- ✅ ADD: Resolved/created above
) VALUES (
  p_device_id, p_image_name, p_captured_at, 'receiving',
  (p_telemetry_data->>'total_chunks')::INT,
  p_telemetry_data, v_company_id, v_session_date,
  v_program_id,                  -- ✅ ADD: Pass resolved value
  v_site_id,                     -- ✅ ADD: Pass resolved value
  v_session_id                   -- ✅ ADD: Pass session_id
)
ON CONFLICT (device_id, image_name) DO UPDATE
SET captured_at = EXCLUDED.captured_at,
    metadata = EXCLUDED.metadata,
    program_id = EXCLUDED.program_id,          -- ✅ UPDATE on conflict
    site_id = EXCLUDED.site_id,                -- ✅ UPDATE on conflict
    site_device_session_id = EXCLUDED.site_device_session_id,  -- ✅ UPDATE on conflict
    updated_at = NOW()
```

---

## How to Apply the Fix

### Option 1: Supabase Dashboard (Recommended)

1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new
2. Open `FIX_DEVICE_IMAGES_INSERT.sql` in this project
3. Copy the entire file contents
4. Paste into the SQL Editor
5. Click **"Run"**
6. Verify: Should see "Success. No rows returned"

### Option 2: psql Command Line

```bash
psql "$SUPABASE_DB_URL" < FIX_DEVICE_IMAGES_INSERT.sql
```

### Option 3: Supabase CLI

```bash
supabase db execute < FIX_DEVICE_IMAGES_INSERT.sql
```

---

## Verification

After applying the fix, test with the same MQTT payload:

```bash
# Send test message
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 \
  -u BrainlyTesting \
  -P 'BrainlyTest@1234' \
  --cafile /etc/ssl/certs/ca-certificates.crt \
  -t 'device/AA:BB:CC:21:30:20/data' \
  -m '{
    "device_id":"AA:BB:CC:21:30:20",
    "capture_timestamp":"2025-11-22T16:01:00Z",
    "image_name":"https://immunolytics.com/wp-content/uploads/2019/10/Image-petri-dish.jpg",
    "image_size":123456,
    "max_chunk_size":128,
    "total_chunks_count":5,
    "location":"GH-01-West",
    "error":0,
    "temperature":8.9,
    "humidity":82,
    "pressure":1009.7,
    "gas_resistance":15.3,
    "battery_voltage":3.92,
    "wifi_rssi":-60
  }'
```

**Expected Result:**
```
[METADATA] Received for image https://... from AA:BB:CC:21:30:20
[METADATA] Inserting image record with metadata: {...}
✅ [METADATA] Image record created successfully: {image_id}
```

**Should NOT see:**
```
❌ record "new" has no field "site_device_session_id"
```

---

## Protocol Compliance Verification

### ✅ What the Device Sends (Per PDF)
- `device_id` (MAC address)
- `capture_timestamp` (ISO 8601)
- `image_name` (filename or URL)
- `image_size` (bytes)
- `max_chunk_size` (bytes per chunk)
- `total_chunks_count` (number of chunks)
- `location` (physical location string)
- `error` (error code, 0 = success)
- Environmental sensors: `temperature`, `humidity`, `pressure`, `gas_resistance`
- Optional: `battery_voltage`, `wifi_rssi`

### ✅ What the Server Resolves
- `device_id` (UUID) ← Looked up from `device_mac`
- `company_id` ← From device lineage
- `program_id` ← From device's site assignment
- `site_id` ← From device's active assignment
- `site_device_session_id` ← Active session for site on that date

### ✅ Architecture Compliance
```
ESP32 Device (Firmware)
    |
    | MQTT Publish
    | (device_mac, telemetry, image_name)
    ↓
Edge Function (mqtt_device_handler)
    |
    | fn_resolve_device_lineage(device_mac)
    ↓
Lineage Resolution
    ├─ devices → device_id, company_id
    ├─ device_site_assignments → site_id
    └─ sites → program_id
    |
    | fn_wake_ingestion_handler(device_id, ...)
    ↓
Context Resolution
    ├─ Validate lineage complete
    ├─ Get/create session for site + date
    └─ INSERT with FULL context
        ├─ device_id ✅
        ├─ company_id ✅
        ├─ program_id ✅ (FIXED)
        ├─ site_id ✅ (FIXED)
        └─ site_device_session_id ✅ (FIXED)
```

---

## Why This Matters

### Data Integrity
- **Images must be linked to sessions** for proper tracking
- **Program and site context required** for RLS policies
- **Company ID needed** for multi-tenancy isolation

### Protocol Compliance (ESP32-CAM PDF)
- Device is **minimal hardware** with limited memory
- Device sends **only sensor data + identifiers**
- **Server is responsible** for all context resolution
- This separation allows **firmware to stay simple**

### Security (Row Level Security)
- RLS policies check `company_id` for isolation
- Queries filter by `program_id` and `site_id`
- Missing context = **failed security checks**

---

## Summary

**Problem:** Function doesn't include required columns in INSERT
**Impact:** Images cannot be created (protocol broken)
**Fix:** Add `program_id`, `site_id`, `site_device_session_id` to INSERT
**Location:** `fn_wake_ingestion_handler` in `FIX_DEVICE_IMAGES_INSERT.sql`
**Urgency:** 🔴 **CRITICAL** - Blocks all image uploads from devices

**Apply now to restore device image ingestion!**
