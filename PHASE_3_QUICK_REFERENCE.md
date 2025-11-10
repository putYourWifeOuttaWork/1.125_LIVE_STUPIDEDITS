# Phase 3 Quick Reference

## Module Responsibilities

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| **types.ts** | Type definitions | DeviceLineage, SiteSessionInfo, ImageBuffer |
| **config.ts** | Environment config | loadConfig() |
| **resolver.ts** | Lineage & sessions | resolveDeviceLineage(), getOrCreateSiteSession() |
| **schedule.ts** | Cron & wake times | parseCronExpression(), calculateNextWake() |
| **storage.ts** | Image upload | uploadImage() |
| **idempotency.ts** | Buffer management | getOrCreateBuffer(), assembleImage() |
| **ack.ts** | MQTT responses | publishMissingChunks(), publishAckOk() |
| **ingest.ts** | Message handling | handleHelloStatus(), handleMetadata(), handleChunk() |
| **finalize.ts** | Image completion | finalizeImage() |
| **retry.ts** | Retry logic | publishRetryCommand(), handleRetryReceipt() |
| **index.ts** | Main orchestrator | connectToMQTT(), handleMqttMessage() |

## MQTT Message Flow

```
HELLO → device/{mac}/status
  ↓
  handleHelloStatus()
  └─> Update last_seen_at

METADATA → ESP32CAM/{mac}/data (no chunk_id)
  ↓
  resolveDeviceLineage() → getOrCreateSiteSession()
  ↓
  handleMetadata() → fn_wake_ingestion_handler
  └─> Create payload + image

CHUNK → ESP32CAM/{mac}/data (with chunk_id)
  ↓
  handleChunk() → Store in buffer
  ↓
  Check complete → finalizeImage()
  └─> Assemble → Upload → fn_image_completion_handler
      └─> publishAckOk()

ACK_OK → device/{mac}/ack
  └─> { ACK_OK: { next_wake_time: "..." } }

MISSING → device/{mac}/ack
  └─> { missing_chunks: [3, 7, 12] }
```

## SQL Handler Calls

| Handler | Called From | Purpose |
|---------|-------------|---------|
| `fn_midnight_session_opener` | resolver.ts | Create daily session |
| `fn_wake_ingestion_handler` | ingest.ts | Create payload + image |
| `fn_image_completion_handler` | finalize.ts | Create observation |
| `fn_image_failure_handler` | finalize.ts | Mark failure |
| `fn_retry_by_id_handler` | retry.ts | Process late retry |
| `fn_get_or_create_device_submission` | (SQL internal) | Create submission shell |

## Key Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **site_device_sessions** | Daily site container | session_id, device_submission_id, expected_wake_count |
| **device_wake_payloads** | Per-wake events | payload_id, wake_window_index, overage_flag, telemetry_data |
| **device_images** | Image tracking | image_id, image_name, status, captured_at, resent_received_at |
| **petri_observations** | Observations | observation_id, submission_id, is_device_generated |
| **submissions** | Daily device shells | submission_id, is_device_generated=true |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| SUPABASE_URL | (required) | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | (required) | Service role key |
| MQTT_HOST | HiveMQ Cloud | MQTT broker host |
| MQTT_PORT | 8883 | MQTT broker port |
| MQTT_USERNAME | BrainlyTesting | MQTT auth username |
| MQTT_PASSWORD | (set) | MQTT auth password |
| STORAGE_BUCKET | petri-images | Storage bucket name |
| BUFFER_CLEANUP_MINUTES | 30 | Stale buffer threshold |
| ALERTS_ENABLED | true | Enable alert creation |

## Common Operations

### Deploy Edge Function
```bash
supabase functions deploy mqtt_device_handler
```

### View Logs
```bash
supabase functions logs mqtt_device_handler --tail
```

### Test Handler Status
```bash
curl https://YOUR_PROJECT.supabase.co/functions/v1/mqtt_device_handler
```

### Check Active Buffers
```sql
-- Via edge function response
GET /functions/v1/mqtt_device_handler
-- Returns: { "active_buffers": N }
```

### Find Stuck Transmissions
```sql
SELECT 
  device_id, image_name, received_chunks, total_chunks,
  NOW() - created_at AS age
FROM device_images
WHERE status = 'receiving'
  AND NOW() - created_at > INTERVAL '30 minutes'
ORDER BY created_at;
```

### Check Today's Sessions
```sql
SELECT 
  s.name, sds.expected_wake_count, sds.completed_wake_count,
  sds.failed_wake_count, sds.status
FROM site_device_sessions sds
JOIN sites s ON sds.site_id = s.site_id
WHERE sds.session_date = CURRENT_DATE;
```

### Verify Observation Linkage
```sql
SELECT 
  po.observation_id,
  po.submission_id,
  s.is_device_generated,
  po.is_device_generated,
  po.created_at
FROM petri_observations po
JOIN submissions s ON po.submission_id = s.submission_id
WHERE po.is_device_generated = true
ORDER BY po.created_at DESC
LIMIT 5;
```

## Troubleshooting

### Issue: Device not resolving lineage
**Symptom:** `[MQTT] Cannot resolve lineage for: MAC`

**Check:**
```sql
SELECT d.device_id, d.device_mac, d.is_active, d.provisioning_status,
       dsa.is_active, dsa.is_primary, dsa.site_id
FROM devices d
LEFT JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
WHERE d.device_mac = 'MAC_ADDRESS';
```

**Fix:** Ensure device has active primary site assignment

### Issue: Session not created
**Symptom:** `[MQTT] Could not get/create session`

**Check:**
```sql
SELECT * FROM site_device_sessions
WHERE site_id = 'SITE_ID'
  AND session_date = CURRENT_DATE;
```

**Fix:** Check site has valid program_id and company_id

### Issue: Missing submission_id
**Symptom:** Observations fail with NOT NULL constraint

**Check:**
```sql
SELECT session_id, device_submission_id
FROM site_device_sessions
WHERE session_date = CURRENT_DATE;
```

**Fix:** Ensure fn_get_or_create_device_submission ran successfully

### Issue: Chunks not assembling
**Symptom:** Stuck at "receiving" status

**Check logs:**
```bash
supabase functions logs mqtt_device_handler | grep -A5 "Missing chunks"
```

**Fix:** Check if missing_chunks published; device may need resend

## Critical Invariants

- ✅ One session per (site_id, session_date)
- ✅ Retry updates same row (never duplicate)
- ✅ All observations have valid submission_id
- ✅ Telemetry captured_at preserved on retry
- ✅ RLS filters by company_id
- ✅ No writes to device_wake_sessions (legacy)

## Performance Tuning

### Buffer Cleanup Frequency
Adjust `BUFFER_CLEANUP_MINUTES` if seeing memory issues:
- Lower (15) = more frequent cleanup
- Higher (60) = less CPU usage

### Lineage Caching
Currently in-memory per request. Consider Redis for multi-instance:
```typescript
// Future: Add Redis caching in resolver.ts
const lineageCache = await redis.get(`lineage:${deviceMac}`);
```

### Chunk Assembly Timeout
If devices send chunks slowly, increase `CHUNK_ASSEMBLY_MINUTES`

## Monitoring Dashboard Queries

### Device Health
```sql
SELECT 
  d.device_code,
  d.last_seen_at,
  d.battery_voltage,
  COUNT(di.image_id) FILTER (WHERE di.status = 'complete' AND di.created_at > NOW() - INTERVAL '1 day') AS images_today,
  COUNT(di.image_id) FILTER (WHERE di.status = 'failed' AND di.created_at > NOW() - INTERVAL '1 day') AS failures_today
FROM devices d
LEFT JOIN device_images di ON d.device_id = di.device_id
WHERE d.is_active = true
GROUP BY d.device_id, d.device_code, d.last_seen_at, d.battery_voltage
ORDER BY d.last_seen_at DESC;
```

### Transmission Success Rate
```sql
SELECT 
  DATE(di.created_at) AS date,
  COUNT(*) FILTER (WHERE di.status = 'complete') AS completed,
  COUNT(*) FILTER (WHERE di.status = 'failed') AS failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE di.status = 'complete') / COUNT(*), 2) AS success_rate
FROM device_images di
WHERE di.created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(di.created_at)
ORDER BY date DESC;
```

### Active Site Sessions
```sql
SELECT 
  s.name,
  sds.status,
  sds.expected_wake_count,
  sds.completed_wake_count,
  ROUND(100.0 * sds.completed_wake_count / NULLIF(sds.expected_wake_count, 0), 1) AS completion_pct
FROM site_device_sessions sds
JOIN sites s ON sds.site_id = s.site_id
WHERE sds.session_date = CURRENT_DATE
ORDER BY completion_pct DESC;
```

---

**Quick Reference Version:** 3.0.0  
**Last Updated:** 2025-11-10
