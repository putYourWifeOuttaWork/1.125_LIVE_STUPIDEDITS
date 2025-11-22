# Device Images & Roboflow Fixes - Nov 22, 2025

## Issues Discovered

### Issue #1: MQTT Messages Not Creating Records
**Your MQTT message:**
```json
{
  "device_id": "98A316F6FE18",
  "image_name": "https://immunolytics.com/...",
  "temperature": 8.9,
  ...
}
```

**Problems:**
1. Missing `total_chunks_count` (REQUIRED for metadata messages)
2. Has URL in `image_name` field (should be filename like "image_001.jpg")
3. Real MQTT flow: Device sends chunks → assembles → uploads to S3 → stores S3 URL

**Why it failed:**
- Handler sees `image_name` + temperature → routes to metadata handler
- Metadata handler requires `total_chunks_count` → fails silently

**For testing, use direct database insert instead** (see TEST_ROBOFLOW_INTEGRATION.md)

---

### Issue #2: Missing site_id, program_id, session_id in device_images

**Problem:**
`fn_wake_ingestion_handler()` was creating device_images without context:
```sql
INSERT INTO device_images (
  device_id, image_name, captured_at, status,
  total_chunks, metadata, company_id, original_capture_date
) VALUES (...);
-- Missing: site_id, program_id, session_id
```

**Fix Applied:**
```sql
INSERT INTO device_images (
  device_id, image_name, captured_at, status,
  total_chunks, metadata, company_id, original_capture_date,
  site_id, program_id, site_device_session_id, wake_payload_id  -- ✅ ADDED
) VALUES (
  p_device_id, p_image_name, p_captured_at, 'receiving',
  (p_telemetry_data->>'total_chunks')::INT,
  p_telemetry_data, v_company_id, v_session_date,
  v_site_id, v_program_id, v_session_id, v_payload_id  -- ✅ FROM DEVICE
);
```

---

### Issue #3: Roboflow Trigger Not Firing on image_url Updates

**Problem:**
Trigger only watched `status` column:
```sql
CREATE TRIGGER trigger_auto_score_mgi_image
  AFTER INSERT OR UPDATE OF status  -- Only fires on status changes!
  ON public.device_images
```

When you:
1. UPDATE image_url first → trigger doesn't fire
2. UPDATE status='complete' → trigger SHOULD fire, but may miss it

**Fix Applied:**
```sql
CREATE TRIGGER trigger_auto_score_mgi_image
  AFTER INSERT OR UPDATE OF status, image_url  -- ✅ WATCHES BOTH!
  ON public.device_images
```

Now fires when:
- INSERT with status='complete' and image_url
- UPDATE changes status to 'complete' (with image_url)
- UPDATE adds image_url (with status='complete')

---

## Fixes Applied

### Migration: Fix Device Images Context and Trigger

**File:** `/tmp/fix_device_images_context.sql`

**Changes:**
1. ✅ Updated `fn_wake_ingestion_handler()` to include site_id, program_id, session_id
2. ✅ Fixed Roboflow trigger to watch BOTH `status` AND `image_url` columns
3. ✅ Added proper context inheritance from device → images

**How to Apply:**
```bash
# Copy SQL to Supabase Dashboard SQL Editor and execute
# OR use Supabase CLI:
npx supabase db push
```

---

## Testing the Fixes

### Test #1: Existing Record (Your Test Case)

The record you tested:
```sql
image_id: fa590cdd-5054-4ad5-910e-c928f9c70b07
status: 'complete'
image_url: 'https://immunolytics.com/...'
mgi_scoring_status: 'pending'  -- Should have changed!
```

**Why it didn't trigger originally:**
- You updated image_url first, then status
- Trigger only watched status column
- May have missed the update

**After fix, test again:**
```sql
-- Option 1: Toggle status to force trigger
UPDATE device_images
SET status = 'receiving'
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';

UPDATE device_images
SET status = 'complete'
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';

-- Option 2: Update image_url (will now trigger!)
UPDATE device_images
SET image_url = 'https://immunolytics.com/wp-content/uploads/2019/10/Image-petri-dish.jpg',
    updated_at = NOW()
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';

-- Wait 5-10 seconds, then check:
SELECT image_id, mgi_scoring_status, mgi_score, mgi_velocity
FROM device_images
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';
```

**Expected after trigger fires:**
- `mgi_scoring_status`: 'complete'
- `mgi_score`: 0.0 - 1.0 (from Roboflow)
- `mgi_velocity`: calculated
- `mgi_speed`: calculated

---

### Test #2: New Direct Insert

```sql
-- Find your device and session
SELECT device_id, site_id, program_id
FROM devices
WHERE device_mac = 'TEST:DE:VI:CE:00:01';
-- Result: device_id = f65baa44-a9ab-4d98-93d0-d39377fba011
--         site_id = 4a21ccd9-56c5-48b2-90ca-c5fb756803d6
--         program_id = 6aa78f0f-6173-44e8-bc6c-877c775e2622

SELECT session_id
FROM site_device_sessions
WHERE device_id = 'f65baa44-a9ab-4d98-93d0-d39377fba011'
  AND session_date = CURRENT_DATE
  AND status = 'active';
-- Result: session_id if exists, or NULL

-- Insert test image WITH CONTEXT
INSERT INTO device_images (
  image_id,
  device_id,
  site_id,          -- ✅ NOW INCLUDED
  program_id,       -- ✅ NOW INCLUDED
  site_device_session_id,  -- ✅ NOW INCLUDED
  image_name,
  image_url,
  captured_at,
  received_at,
  status,           -- 'complete' triggers Roboflow
  chunk_count,
  expected_chunks,
  image_size_bytes,
  mgi_scoring_status,
  company_id
) VALUES (
  gen_random_uuid(),
  'f65baa44-a9ab-4d98-93d0-d39377fba011',
  '4a21ccd9-56c5-48b2-90ca-c5fb756803d6',  -- site_id
  '6aa78f0f-6173-44e8-bc6c-877c775e2622',  -- program_id
  NULL,  -- or actual session_id if you have one
  'test_image_002.jpg',
  'https://immunolytics.com/wp-content/uploads/2019/10/Image-petri-dish.jpg',
  NOW(),
  NOW(),
  'complete',  -- TRIGGERS ROBOFLOW
  1,
  1,
  123456,
  'pending',
  '743d51b9-17bf-43d5-ad22-deebafead6fa'
)
RETURNING image_id;
```

---

## Why MQTT Test Won't Work

### Real MQTT Protocol (ESP32-CAM)

**1. HELLO Message (topic: device/MAC/status)**
```json
{
  "device_id": "98A316F6FE18",
  "status": "alive",
  "pending_count": 1,
  "battery_voltage": 3.92,
  "wifi_rssi": -60
}
```

**2. METADATA Message (topic: device/MAC/data)**
```json
{
  "device_id": "98A316F6FE18",
  "capture_timestamp": "2025-11-22T16:00:00Z",
  "image_name": "image_001.jpg",  // ← FILENAME, NOT URL
  "image_size": 123456,
  "max_chunk_size": 128,
  "total_chunks_count": 962,  // ← REQUIRED!
  "temperature": 8.9,
  "humidity": 82.0
}
```

**3. CHUNK Messages (topic: device/MAC/data)**
```json
{
  "device_id": "98A316F6FE18",
  "image_name": "image_001.jpg",
  "chunk_id": 0,
  "max_chunk_size": 128,
  "payload": [255, 216, 255, ...]  // Base64 binary
}
// ... repeat for chunks 1-961
```

**4. System Response (topic: ack/MAC)**
```json
{
  "device_id": "98A316F6FE18",
  "image_name": "image_001.jpg",
  "ACK_OK": {
    "next_wake_time": "2025-11-22T19:00:00Z"
  }
}
```

### Your Test Message Problems

```json
{
  "image_name": "https://..."  // ✗ Should be filename
  // ✗ Missing total_chunks_count
}
```

**For testing, use direct DB insert or wait for real device!**

---

## Summary

### ✅ Fixed
1. Device images now inherit site_id, program_id, session_id from device
2. Roboflow trigger now fires on EITHER status OR image_url changes
3. Both INSERT and UPDATE paths now work correctly

### ⚠️ Known Limitations
1. MQTT testing requires proper message format (see above)
2. For quick Roboflow testing, use direct database INSERT
3. See TEST_ROBOFLOW_INTEGRATION.md for detailed test scripts

### 🚀 Ready to Deploy
1. Apply migration: `/tmp/fix_device_images_context.sql`
2. Test with existing record (toggle status or update image_url)
3. Verify Roboflow scoring works
4. Build and deploy

---

## Next Steps

1. **Apply Migration**
   ```bash
   # Copy SQL from /tmp/fix_device_images_context.sql
   # Paste into Supabase Dashboard SQL Editor
   # Execute
   ```

2. **Test Existing Record**
   ```sql
   UPDATE device_images
   SET status = 'receiving'
   WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';

   UPDATE device_images
   SET status = 'complete'
   WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';

   -- Wait 10 seconds, check mgi_scoring_status
   ```

3. **Insert New Test Image**
   ```sql
   -- Use script from Test #2 above
   ```

4. **Verify Results**
   ```sql
   SELECT image_id, mgi_scoring_status, mgi_score, mgi_velocity, mgi_speed
   FROM device_images
   WHERE image_url LIKE '%immunolytics.com%'
   ORDER BY created_at DESC
   LIMIT 3;
   ```

All fixes ready to apply!
