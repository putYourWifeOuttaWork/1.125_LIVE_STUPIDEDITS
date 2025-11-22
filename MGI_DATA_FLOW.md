# MGI Scoring Data Flow - Complete Architecture

## Device-Centric Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MQTT DEVICE SENDS IMAGE                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  EDGE FUNCTION: mqtt_device_handler                                     │
│  - Receives chunks                                                      │
│  - Assembles in edge_chunk_buffer                                       │
│  - Uploads to S3 storage                                                │
│  - Creates device_images row                                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  TABLE: device_images                                                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ image_id: uuid                                                   │  │
│  │ device_id: uuid                                                  │  │
│  │ status: 'receiving' → 'complete'  ← TRIGGER POINT               │  │
│  │ image_url: 'https://storage.supabase.co/...'                    │  │
│  │ captured_at: timestamptz                                         │  │
│  │                                                                  │  │
│  │ mgi_score: NULL (will be filled by Roboflow)                    │  │
│  │ mgi_velocity: NULL (auto-calculated)                            │  │
│  │ mgi_speed: NULL (auto-calculated)                               │  │
│  │ mgi_scoring_status: 'pending'                                   │  │
│  │ roboflow_response: NULL (will store full response)              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                     status = 'complete' AND image_url IS NOT NULL
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  TRIGGER: trg_auto_score_mgi_image()                                    │
│  - Fires AFTER UPDATE on device_images                                  │
│  - Calls edge function via pg_net.http_post()                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  EDGE FUNCTION: score_mgi_image                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 1. Receives: { image_id, image_url }                            │  │
│  │                                                                  │  │
│  │ 2. Updates status:                                               │  │
│  │    mgi_scoring_status = 'in_progress'                           │  │
│  │                                                                  │  │
│  │ 3. Calls Roboflow API:                                           │  │
│  │    POST https://serverless.roboflow.com/.../custom-workflow     │  │
│  │    Body: {                                                       │  │
│  │      api_key: "VD3fJI17y2IgnbOhYmvu",                          │  │
│  │      inputs: {                                                   │  │
│  │        image: { type: "url", value: IMAGE_URL },                │  │
│  │        param2: "MGI"  ← CRITICAL PARAMETER                     │  │
│  │      }                                                            │  │
│  │    }                                                              │  │
│  │                                                                  │  │
│  │ 4. Receives Response:                                            │  │
│  │    [{ "MGI": "0.05" }]  ← Roboflow format                       │  │
│  │                                                                  │  │
│  │ 5. Parses:                                                       │  │
│  │    mgiScore = parseFloat(response[0].MGI)  // 0.05             │  │
│  │                                                                  │  │
│  │ 6. Updates device_images:                                        │  │
│  │    mgi_score = 0.05                                             │  │
│  │    mgi_scoring_status = 'complete'                              │  │
│  │    mgi_scored_at = NOW()                                         │  │
│  │    roboflow_response = full JSON                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                        UPDATE device_images SET mgi_score
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  TRIGGER: calculate_and_rollup_mgi()                                    │
│  - Fires BEFORE INSERT/UPDATE on device_images                          │
│  - When mgi_score is NOT NULL                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 1. Calculate mgi_velocity:                                       │  │
│  │    - Get previous mgi_score for this device                      │  │
│  │    - velocity = current_score - previous_score                   │  │
│  │    - Example: 0.05 - 0.03 = 0.02 (growing)                      │  │
│  │                                                                  │  │
│  │ 2. Calculate mgi_speed:                                          │  │
│  │    - Get program start_date                                      │  │
│  │    - days_since_start = current_date - start_date               │  │
│  │    - speed = mgi_score / days_since_start                       │  │
│  │    - Example: 0.05 / 10 days = 0.005 per day                    │  │
│  │                                                                  │  │
│  │ 3. Updates same row:                                             │  │
│  │    NEW.mgi_velocity = 0.02                                       │  │
│  │    NEW.mgi_speed = 0.005                                         │  │
│  │                                                                  │  │
│  │ 4. Rollup to devices table:                                      │  │
│  │    UPDATE devices SET                                            │  │
│  │      latest_mgi_score = 0.05,                                   │  │
│  │      latest_mgi_velocity = 0.02,                                │  │
│  │      latest_mgi_at = NOW()                                       │  │
│  │    WHERE device_id = NEW.device_id                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  TABLE: devices (rollup values updated)                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ device_id: uuid                                                  │  │
│  │ device_name: "Device-001"                                        │  │
│  │ latest_mgi_score: 0.05        ← From device_images              │  │
│  │ latest_mgi_velocity: 0.02     ← Calculated                      │  │
│  │ latest_mgi_at: '2025-11-22 12:34:56'                            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  SCHEDULED: session_wake_snapshots (every 3 hours by default)           │
│  - NOT triggered by MGI updates                                         │
│  - Created on schedule via pg_cron                                      │
│  - Aggregates ALL data since last snapshot                              │
│  - Includes latest MGI scores at time of snapshot                       │
│  - Used for timeline playback and historical visualization              │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  TRIGGER?: Check alert thresholds                                       │
│  - When devices.latest_mgi_score updates                                │
│  - Compares against device_alert_thresholds                             │
│  - Creates device_alerts if threshold exceeded                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  UI DISPLAYS UPDATED DATA                                               │
│  - Site maps show new MGI colors                                        │
│  - Charts show velocity/speed trends                                    │
│  - Device detail pages show latest scores                               │
│  - Timeline playback uses updated snapshots                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Error Handling & Retry Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  IF SCORING FAILS                                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Edge function updates:                                                 │
│  - mgi_scoring_status = 'failed'                                        │
│  - roboflow_response = { error: "..." }                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                          Wait 10 minutes
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  PG_CRON JOB: Every 10 minutes                                          │
│  - Calls fn_retry_failed_mgi_scoring()                                  │
│  - Finds images with status = 'failed' or stuck 'in_progress'          │
│  - Retries up to 10 images per run                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                    Retry edge function call
                                    ↓
                    Success → status = 'complete'
```

---

## Data Types & Ranges

### device_images Table

```typescript
{
  image_id: UUID,
  device_id: UUID,
  status: 'pending' | 'receiving' | 'complete' | 'failed',
  image_url: string,  // S3 URL
  captured_at: timestamptz,

  // MGI Scoring (filled by Roboflow)
  mgi_score: number,  // 0.0 - 1.0 (0% - 100% mold growth)
  mgi_velocity: number,  // Change from previous image (can be negative)
  mgi_speed: number,  // MGI per day from program start
  mgi_scored_at: timestamptz,
  mgi_scoring_status: 'pending' | 'in_progress' | 'complete' | 'failed' | 'skipped',
  roboflow_response: JSONB  // Full API response for debugging
}
```

### Roboflow API

**Request:**
```json
{
  "api_key": "VD3fJI17y2IgnbOhYmvu",
  "inputs": {
    "image": {
      "type": "url",
      "value": "https://nkecewxlwkqtxbvytjjb.supabase.co/storage/v1/object/public/device-images/..."
    },
    "param2": "MGI"
  }
}
```

**Response:**
```json
[
  {
    "MGI": "0.05"
  }
]
```

**Parsed Value:**
```javascript
const mgiScore = parseFloat(response[0].MGI);  // 0.05
```

---

## Key Decision Points

### 1. When Does Scoring Trigger?
- ✅ When `device_images.status` changes to `'complete'`
- ✅ AND `image_url` is NOT NULL
- ❌ NO requirement for `observation_id` (removed)
- ❌ NO dependency on `petri_observations` (legacy)

### 2. Where Is MGI Score Stored?
- ✅ PRIMARY: `device_images.mgi_score`
- ✅ ROLLUP: `devices.latest_mgi_score`
- ❌ NOT: `petri_observations` (legacy, ignore completely)

### 3. What Triggers Automatically?
- ✅ Roboflow API call (via trigger when image completes)
- ✅ Velocity calculation (via trigger when mgi_score updates)
- ✅ Speed calculation (via trigger when mgi_score updates)
- ✅ Rollup to devices table (via trigger when mgi_score updates)
- ✅ Snapshot creation (via pg_cron on schedule, NOT per-update)
- ⚠️ Alert threshold check (verify trigger exists)

---

## Performance Characteristics

### Latency
- Device → Image Complete: ~30-60 seconds (depending on chunks)
- Trigger → Edge Function Call: <1 second
- Roboflow API: ~2-5 seconds
- Database Updates: <100ms
- **Total End-to-End: ~3-7 seconds after image complete**

### Scale
- Concurrent scoring: Limited by Roboflow API (unknown rate limit)
- Retry mechanism: Max 10 images per 10 minutes = 60/hour
- Database triggers: No bottleneck (sub-millisecond)

### Monitoring
```sql
-- Check scoring throughput
SELECT
  DATE_TRUNC('hour', mgi_scored_at) as hour,
  COUNT(*) as images_scored,
  AVG(EXTRACT(EPOCH FROM (mgi_scored_at - received_at))) as avg_latency_seconds
FROM device_images
WHERE mgi_scored_at IS NOT NULL
GROUP BY hour
ORDER BY hour DESC;
```

---

## Tables Summary

### Primary Storage
- **device_images**: Images, MGI scores, velocity, speed (per-image granularity)
- **devices**: Latest MGI rollup (per-device summary)

### Supporting Tables
- **edge_chunk_buffer**: Temporary chunk assembly during transmission
- **device_alert_thresholds**: MGI threshold configuration
- **device_alerts**: Active alerts when thresholds exceeded
- **session_wake_snapshots**: Timeline snapshots for visualization
- **async_error_logs**: Error tracking for debugging

### Legacy Tables (IGNORE)
- ~~petri_observations~~ - Do not use
- ~~gasifier_observations~~ - Do not use
- ~~split_petri_images~~ - Do not use

---

## Success Metrics

After deployment, verify:

1. ✅ Every completed image gets scored within 10 seconds
2. ✅ No images stuck in 'in_progress' for >5 minutes
3. ✅ Failed images retry automatically
4. ✅ Velocity/speed calculate correctly
5. ✅ Devices table stays in sync with latest scores
6. ✅ UI shows updated MGI values immediately

**Monitor with:**
```sql
SELECT
  mgi_scoring_status,
  COUNT(*) as count,
  MIN(received_at) as oldest_pending
FROM device_images
WHERE status = 'complete'
GROUP BY mgi_scoring_status;
```

Expected result after a few hours:
- `complete`: 95%+
- `failed`: <5% (should retry and succeed)
- `pending`: 0 (all should be processed)
- `in_progress`: 0 (should complete quickly)
