# Protocol vs Database Mismatch - Visual Guide

## The Problem in Pictures

### What the ESP32 Device Sends (Per PDF Section 5)

```
┌─────────────────────────────────────┐
│   ESP32-CAM Device (Firmware)       │
│                                     │
│   ONLY sends what it knows:         │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│   ✅ device_id (MAC)                │
│   ✅ capture_timestamp              │
│   ✅ image_name                     │
│   ✅ image_size                     │
│   ✅ total_chunks_count             │
│   ✅ temperature, humidity, etc.    │
│                                     │
│   ❌ NO company_id                  │
│   ❌ NO program_id                  │
│   ❌ NO site_id                     │
│   ❌ NO session_id                  │
└─────────────────────────────────────┘
           │
           │ MQTT Publish
           ↓
```

### What the Database Table Requires

```
┌──────────────────────────────────────────────┐
│   device_images Table Schema                 │
│                                              │
│   REQUIRES for proper operation:             │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│   ✅ device_id (UUID)         NOT NULL      │
│   ✅ image_name (text)        NOT NULL      │
│   ✅ captured_at (timestamptz) NOT NULL     │
│   ✅ company_id (uuid)        for RLS       │
│   ⚠️  program_id (uuid)       for RLS       │
│   ⚠️  site_id (uuid)          for RLS       │
│   ⚠️  site_device_session_id  for tracking  │
│                                              │
│   Trigger: populate_device_data_company_id() │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│   Checks: IF NEW.site_device_session_id...  │
│   Error: "record has no field..."  ❌        │
└──────────────────────────────────────────────┘
```

### The Broken Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Current (BROKEN) Flow                          │
└─────────────────────────────────────────────────────────────────────┘

1. Device Sends:
   {
     "device_id": "AA:BB:CC:21:30:20",
     "image_name": "image_001.jpg",
     "temperature": 25.5,
     ...
   }

2. Edge Function receives → fn_resolve_device_lineage()
   Returns:
   {
     device_id: "49610cef-...",  ✅
     company_id: "743d51b9-...", ✅
     program_id: "6aa78f0f-...", ✅ (RESOLVED!)
     site_id: "134218af-...",    ✅ (RESOLVED!)
   }

3. fn_wake_ingestion_handler() called
   Resolves:
   {
     session_id: "abc123..."     ✅ (RESOLVED!)
   }

4. ❌ INSERT INTO device_images() - MISSING COLUMNS!
   INSERT INTO device_images (
     device_id,     ← ✅ Has it
     image_name,    ← ✅ Has it
     captured_at,   ← ✅ Has it
     company_id,    ← ✅ Has it
     -- program_id,        ❌ MISSING (even though we resolved it!)
     -- site_id,           ❌ MISSING (even though we resolved it!)
     -- site_device_session_id,  ❌ MISSING (even though we resolved it!)
   ) VALUES (...)

5. ❌ Trigger Fires:
   BEGIN
     IF NEW.site_device_session_id IS NULL THEN  ← BOOM! Field doesn't exist!
       ...
   END

6. 💥 PostgreSQL Error:
   record "new" has no field "site_device_session_id"
```

### The Fixed Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Fixed Flow                                     │
└─────────────────────────────────────────────────────────────────────┘

1. Device Sends:
   {
     "device_id": "AA:BB:CC:21:30:20",
     "image_name": "image_001.jpg",
     "temperature": 25.5,
     ...
   }

2. Edge Function receives → fn_resolve_device_lineage()
   Returns:
   {
     device_id: "49610cef-...",  ✅
     company_id: "743d51b9-...", ✅
     program_id: "6aa78f0f-...", ✅
     site_id: "134218af-...",    ✅
   }

3. fn_wake_ingestion_handler() called
   Resolves:
   {
     session_id: "abc123..."     ✅
   }

4. ✅ INSERT INTO device_images() - ALL COLUMNS INCLUDED!
   INSERT INTO device_images (
     device_id,                 ← ✅ Has it
     image_name,                ← ✅ Has it
     captured_at,               ← ✅ Has it
     company_id,                ← ✅ Has it
     program_id,                ← ✅ NOW INCLUDED!
     site_id,                   ← ✅ NOW INCLUDED!
     site_device_session_id     ← ✅ NOW INCLUDED!
   ) VALUES (
     p_device_id,
     p_image_name,
     p_captured_at,
     v_company_id,
     v_program_id,              ← ✅ Pass resolved value
     v_site_id,                 ← ✅ Pass resolved value
     v_session_id               ← ✅ Pass session_id
   )

5. ✅ Trigger Fires:
   BEGIN
     IF NEW.site_device_session_id IS NULL THEN  ← Works! Field exists!
       -- Inherit from active session
     END IF;
   END

6. ✅ Success!
   Image record created with full context:
   {
     image_id: "31742c6d-...",
     device_id: "49610cef-...",
     company_id: "743d51b9-...",
     program_id: "6aa78f0f-...",     ← ✅
     site_id: "134218af-...",        ← ✅
     site_device_session_id: "abc123..." ← ✅
   }
```

---

## Side-by-Side Comparison

### INSERT Statement

| Before (Broken) | After (Fixed) |
|----------------|---------------|
| `INSERT INTO device_images (` | `INSERT INTO device_images (` |
| `  device_id,` | `  device_id,` |
| `  image_name,` | `  image_name,` |
| `  captured_at,` | `  captured_at,` |
| `  status,` | `  status,` |
| `  total_chunks,` | `  total_chunks,` |
| `  metadata,` | `  metadata,` |
| `  company_id,` | `  company_id,` |
| `  original_capture_date` | `  original_capture_date,` |
| ❌ **MISSING!** | ✅ `  program_id,` |
| ❌ **MISSING!** | ✅ `  site_id,` |
| ❌ **MISSING!** | ✅ `  site_device_session_id` |
| `)` | `)` |

### VALUES Clause

| Before (Broken) | After (Fixed) |
|----------------|---------------|
| `VALUES (` | `VALUES (` |
| `  p_device_id,` | `  p_device_id,` |
| `  p_image_name,` | `  p_image_name,` |
| `  p_captured_at,` | `  p_captured_at,` |
| `  'receiving',` | `  'receiving',` |
| `  (p_telemetry_data->>'total_chunks')::INT,` | `  (p_telemetry_data->>'total_chunks')::INT,` |
| `  p_telemetry_data,` | `  p_telemetry_data,` |
| `  v_company_id,` | `  v_company_id,` |
| `  v_session_date` | `  v_session_date,` |
| ❌ **MISSING!** | ✅ `  v_program_id,` |
| ❌ **MISSING!** | ✅ `  v_site_id,` |
| ❌ **MISSING!** | ✅ `  v_session_id` |
| `)` | `)` |

---

## Why The Trigger Fails

PostgreSQL's `NEW` record only contains columns explicitly listed in the INSERT statement.

```sql
-- When you write:
INSERT INTO device_images (device_id, image_name, company_id)
VALUES ('abc', 'img.jpg', '123')

-- The trigger sees:
NEW = {
  device_id: 'abc',
  image_name: 'img.jpg',
  company_id: '123'
  -- That's it! No other fields!
}

-- So this code fails:
IF NEW.site_device_session_id IS NULL THEN  -- ❌ Field doesn't exist!
  ...
END IF;

-- Error: "record "new" has no field "site_device_session_id""
```

**Fix:** Include ALL required columns in the INSERT statement!

---

## Architecture Principles

### Separation of Concerns (ESP32-CAM Protocol)

1. **Device Responsibility:**
   - Capture images
   - Read sensors
   - Send raw data over MQTT
   - **DOES NOT** know about:
     - Companies
     - Programs
     - Sites
     - Sessions

2. **Server Responsibility:**
   - Receive device data
   - Resolve device identity (MAC → UUID)
   - Look up lineage (device → site → program → company)
   - Manage sessions (date-based)
   - Store with full context

### Why This Design?

- **Minimal firmware**: Device code stays simple
- **Centralized logic**: All business rules in one place
- **Easy updates**: Change lineage logic without reflashing devices
- **Scalability**: Server handles complexity, not 100+ devices

---

## Summary

**The Issue:**
```
Function had context (program_id, site_id, session_id)
        ↓
But didn't pass it to INSERT
        ↓
Trigger tried to check column that wasn't in INSERT list
        ↓
PostgreSQL error: "record has no field..."
```

**The Solution:**
```
Function has context (program_id, site_id, session_id)
        ↓
NOW passes it to INSERT ✅
        ↓
Trigger sees all columns ✅
        ↓
Success! Image created with full context ✅
```

**Apply `FIX_DEVICE_IMAGES_INSERT.sql` to resolve!**
