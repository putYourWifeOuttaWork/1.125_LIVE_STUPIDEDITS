# MQTT Device Handler V3 - Phase 3 Implementation

## Overview

Complete replacement of the MQTT device handler with modular architecture that fully integrates with Phase 2.5 SQL handlers.

## Architecture

### Modules

1. **types.ts** - TypeScript type definitions for all data structures
2. **config.ts** - Environment configuration loading and validation
3. **resolver.ts** - Device lineage resolution and session lookup
4. **schedule.ts** - Cron parsing and wake time calculations
5. **storage.ts** - Idempotent image upload to Supabase Storage
6. **idempotency.ts** - Buffer management and duplicate prevention
7. **ack.ts** - MQTT acknowledgment message publishing
8. **ingest.ts** - HELLO, metadata, and chunk ingestion
9. **finalize.ts** - Image assembly, upload, observation creation
10. **retry.ts** - Retry command publishing and late arrival handling
11. **index.ts** - Main orchestrator and MQTT router

## Data Flow

```
Device Wake → HELLO Status → handleHelloStatus
                ↓
         Update last_seen_at

Device Metadata → handleMetadata
                     ↓
              resolveDeviceLineage
                     ↓
              getOrCreateSiteSession
                     ↓
           fn_wake_ingestion_handler (SQL)
                     ↓
              Create payload + image records

Device Chunks → handleChunk
                     ↓
               Store in buffer
                     ↓
          Check if complete → finalizeImage
                                    ↓
                              Assemble chunks
                                    ↓
                              Upload to storage
                                    ↓
                       fn_image_completion_handler (SQL)
                                    ↓
                       Create petri_observation
                                    ↓
                          Calculate next_wake
                                    ↓
                          Publish ACK_OK
```

## SQL Handler Integration

All database operations use Phase 2.5 SQL handlers:

- `fn_midnight_session_opener` - Create daily sessions
- `fn_wake_ingestion_handler` - Create payloads and images
- `fn_image_completion_handler` - Create observations
- `fn_image_failure_handler` - Mark failures
- `fn_retry_by_id_handler` - Process retries

## Environment Variables

Required:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

Optional (with defaults):
- `MQTT_HOST` - MQTT broker host
- `MQTT_PORT` - MQTT broker port (8883)
- `MQTT_USERNAME` - MQTT username
- `MQTT_PASSWORD` - MQTT password
- `STORAGE_BUCKET` - Storage bucket name (petri-images)
- `BUFFER_CLEANUP_MINUTES` - Stale buffer cleanup threshold (30)
- `CHUNK_ASSEMBLY_MINUTES` - Chunk assembly timeout (15)
- `ALERTS_ENABLED` - Enable alert generation (true)

## Deployment

Replace existing handler:

```bash
# Backup old handler
mv supabase/functions/mqtt_device_handler supabase/functions/mqtt_device_handler_old

# Deploy new handler
mv supabase/functions/mqtt_device_handler_v3 supabase/functions/mqtt_device_handler

# Deploy to Supabase
supabase functions deploy mqtt_device_handler
```

## Testing

Five verification tests (see CONTEXT):

1. Happy path - Complete transmission
2. Missing chunks - Retry mechanism
3. Overage wake - Unexpected timing
4. Retry-by-ID - Late arrival
5. TZ boundary - Midnight crossover

## Monitoring

Check logs:
```bash
supabase functions logs mqtt_device_handler
```

Key metrics:
- Active buffers count
- Chunk receipt progress
- ACK_OK publications
- Error rates by module

## Invariants Maintained

- One session per (site_id, session_date)
- Retry updates same rows (no duplicates)
- All observations have valid submission_id
- Telemetry authority preserved
- RLS company filtering enforced
- No writes to legacy device_wake_sessions
