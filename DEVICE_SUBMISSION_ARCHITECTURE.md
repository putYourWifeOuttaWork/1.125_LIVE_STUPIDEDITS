# Device Submission System - Complete Architecture Reference

**Purpose**: Canonical reference for all device-generated submission logic. This document must be consulted for any future changes to the device submission system.

---

## Executive Summary

The device submission system transforms IoT devices from passive data collectors into autonomous submission generators. Each device wake creates structured, analytics-ready data with full lineage tracking (company → program → site → session → device → payload).

**Core Principle**: One device = one image per wake window. Multiple devices at a site = site fleet. Daily collection window = site session.

---

## Data Model

### Hierarchy

```
company_id
  └─> program_id
       └─> site_id
            └─> site_device_session_id (daily)
                 └─> device_id
                      └─> device_wake_payload_id (per wake)
                           └─> image_id (one image)
                                └─> observation_id (one observation)
```

### Core Tables

#### 1. site_device_sessions

**Purpose**: Daily time-bounded container for all device wakes at a site.

**Key Columns**:
- `session_date`: Calendar date in site timezone
- `expected_wake_count`: Sum of all device wake windows (locked at midnight)
- `completed_wake_count`: Successfully received wakes
- `failed_wake_count`: Failed transmissions
- `extra_wake_count`: Unexpected wakes (overage)
- `status`: `pending` | `in_progress` | `locked`
- `config_changed_flag`: TRUE if device settings changed mid-day

**Invariants**:
- One session per (site_id, session_date)
- Sessions are NEVER "incomplete" - they are time-based only
- Status transitions: `pending` → `in_progress` → `locked`
- Cannot be unlocked once locked

#### 2. device_wake_payloads

**Purpose**: Canonical per-wake event record. Supersedes `device_wake_sessions`.

**Key Columns**:
- Full lineage: `company_id`, `program_id`, `site_id`, `site_device_session_id`, `device_id`
- `captured_at`: From device metadata (authoritative timestamp)
- `received_at`: When server received complete data
- `wake_window_index`: Server-inferred ordinal (1st, 2nd, 3rd wake of day)
- `image_id`: Links to device_images (same row reused on retry)
- Telemetry snapshot: `temperature`, `humidity`, `pressure`, `gas_resistance`, `battery_voltage`, `wifi_rssi`
- `telemetry_data`: Full raw JSONB backup
- `payload_status`: `pending` | `complete` | `failed`
- `overage_flag`: TRUE if wake not in expected schedule buckets
- `resent_received_at`: Audit trail for late fixes

**Invariants**:
- Every payload MUST have full lineage
- Telemetry is device-authoritative (never override with server data)
- Retry updates same row via image_id link
- captured_at preserved on retry, resent_received_at updated

#### 3. device_schedule_changes

**Purpose**: Queue for per-device wake schedule changes.

**Key Columns**:
- `new_wake_schedule_cron`: Cron expression (e.g., "0 8,16 * * *")
- `requested_at`: When user/admin requested change
- `effective_date`: Date when change takes effect (midnight)
- `applied_at`: NULL until midnight cron job applies it
- `applied_by_function`: Cron job identifier

**Invariants**:
- Changes ONLY effective at midnight
- If multiple changes for same device, last `requested_at` wins
- Once applied, cannot be unapplied (audit trail only)

---

## Function Reference

### Midnight Session Lifecycle

#### fn_midnight_session_opener(site_id UUID)

**Trigger**: pg_cron at 00:00 site timezone

**Steps**:
1. Apply pending schedule changes for today
2. Calculate expected_wake_count from device schedules
3. Create site_device_sessions row (or update if exists)
4. Set config_changed_flag if schedules were modified

**Returns**: JSONB with session_id, expected_wake_count, config_changed

#### fn_midnight_session_opener_all()

**Trigger**: pg_cron at 00:00 UTC

**Steps**:
1. Loop through all active sites in active programs
2. Call fn_midnight_session_opener for each
3. Collect results and error counts

**Returns**: JSONB with success_count, error_count, results array

### End-of-Day Lifecycle

#### fn_end_of_day_locker(site_id UUID)

**Trigger**: pg_cron at 23:59:59 site timezone

**Steps**:
1. Lock session (status = 'locked', locked_at = NOW())
2. Check for missed wakes per device (>2 missed → alert)
3. Check for high failure rate (>30% → alert)
4. Check for low battery (<3.6V → alert)

**Returns**: JSONB with alerts_created, completed/failed/expected counts

#### fn_end_of_day_locker_all()

**Trigger**: pg_cron at 23:59:59 UTC

**Steps**:
1. Loop through all unlocked sessions for today
2. Call fn_end_of_day_locker for each
3. Aggregate alert counts

**Returns**: JSONB with total_alerts_created, success_count

### Wake Ingestion

#### fn_wake_ingestion_handler(device_id, captured_at, image_name, telemetry_data)

**Trigger**: Edge function on device metadata receipt (before chunks)

**Steps**:
1. Resolve lineage (device → site → program → company)
2. Get or create today's session for site
3. Infer wake_window_index from schedule and captured_at
4. Create device_wake_payloads row
5. Create or update device_images row
6. Link payload to image
7. Update session extra_wake_count if overage

**Returns**: JSONB with payload_id, image_id, session_id, wake_index, is_overage

### Image Lifecycle

#### fn_image_completion_handler(image_id, image_url)

**Trigger**: Edge function on ACK_OK (all chunks received)

**Steps**:
1. Update device_images (status = 'complete', received_at = NOW())
2. Update linked device_wake_payloads (image_status = 'complete')
3. Determine slot mapping (device slot_index > wake_window_index)
4. Create petri_observation (is_device_generated = TRUE)
5. Link observation back to image
6. Increment session completed_wake_count

**Returns**: JSONB with observation_id, payload_id, session_id, slot_index

#### fn_image_failure_handler(image_id, error_code, error_message)

**Trigger**: Edge function on transmission failure or timeout

**Steps**:
1. Mark device_images as failed
2. Update linked device_wake_payloads (image_status = 'failed')
3. Increment session failed_wake_count
4. Create device_alert (type = 'image_transmission_failed')

**Returns**: JSONB with device_id, error_code, alert_created flag

#### fn_retry_by_id_handler(device_id, image_name, new_image_url)

**Trigger**: Edge function or user-initiated resend button

**Steps**:
1. Locate original image by (device_id, image_name)
2. Update SAME image row (never create duplicate):
   - status = 'complete' (if new_image_url provided)
   - resent_received_at = NOW()
   - retry_count += 1
   - captured_at UNCHANGED (preserves original)
3. Update linked payload in ORIGINAL session
4. If was failed, recompute counters for original session:
   - completed_wake_count += 1
   - failed_wake_count -= 1
5. Create observation if missing

**Returns**: JSONB with was_failed, is_complete, retry_count, original_captured_at

---

## Retry-by-ID Logic (Critical)

### Problem Statement

Device images can fail transmission due to network issues, timeouts, or corrupted packets. When retried (hours or days later), the system must:
1. Update the SAME database row (never duplicate)
2. Map back to the ORIGINAL session (by capture date)
3. Preserve original telemetry (captured_at remains unchanged)
4. Recompute original session counters

### Solution

**Stable Identifier**: `image_name` from device (e.g., "IMG_001.jpg")

**Lookup Key**: `(device_id, image_name)`

**Update Logic**:
```sql
UPDATE device_images
SET status = 'complete',
    image_url = :new_url,
    resent_received_at = NOW(),  -- Audit trail
    retry_count = retry_count + 1
WHERE device_id = :device_id
  AND image_name = :image_name
-- captured_at stays original!
```

**Counter Recomputation**:
```sql
-- Find original session by original_capture_date
UPDATE site_device_sessions
SET completed_wake_count = completed_wake_count + 1,
    failed_wake_count = GREATEST(failed_wake_count - 1, 0)
WHERE session_id = (
  SELECT site_device_session_id FROM device_wake_payloads
  WHERE image_id = :original_image_id
);
```

**Telemetry Anchoring**: Use original `captured_at` telemetry, not current. This preserves temporal accuracy for analytics.

---

## Dynamic Wake Schedules

### Problem Statement

Devices may need schedule changes mid-deployment (e.g., high mold growth triggers 10x/day sampling). Changes must be audited and applied safely without breaking active sessions.

### Solution

**Queue-and-Apply Pattern**:
1. Admin requests schedule change via UI
2. Record written to `device_schedule_changes` with `effective_date = tomorrow`
3. At midnight, cron job applies pending changes:
   - Updates `devices.wake_schedule_cron`
   - Marks change as `applied_at = NOW()`
   - Recalculates expected_wake_count for new session
4. Old session remains unchanged (locked with original expectations)

**Conflict Resolution**: If multiple changes queued for same device/date, **last requested_at wins**.

**UI Preview**: Show "This change will take effect at midnight (10 hours from now)"

---

## Session Completeness Tracking

### Definitions

- **Expected**: Sum of all device wake_schedule_cron counts for the day (locked at midnight)
- **Completed**: Count of payloads with payload_status = 'complete'
- **Failed**: Count of payloads with payload_status = 'failed'
- **Extra**: Count of overage wakes (not in expected schedule buckets)

### Completeness States

```
Session Completeness = (completed / expected) * 100%

100%    = All expected wakes received successfully
80-99%  = Mostly complete (acceptable)
50-79%  = Partial (warning)
<50%    = Poor (alert)
```

**Important**: Sessions are NEVER marked "incomplete". They are time-based containers. Completeness is a computed metric, not a status.

### UI Display

```
Device Session: Jan 15, 2025
Expected: 6 | Completed: 5 | Failed: 1 | Extra: 0
[████████████████████░░░] 83% Complete
```

---

## Overage Handling

### Problem Statement

Devices may send unexpected wakes due to:
- Firmware bugs (infinite loop)
- Manual interventions (user presses "capture now")
- Schedule change race conditions

The system must accept and track overage wakes without breaking session integrity.

### Solution

**Overage Detection**:
```sql
-- Server infers wake_window_index by snapping to schedule
-- If captured_at is >1 hour from nearest bucket → overage
SELECT fn_infer_wake_window_index(captured_at, cron_expression);
-- Returns: wake_index, is_overage
```

**Tracking**:
- Set `device_wake_payloads.overage_flag = TRUE`
- Increment `site_device_sessions.extra_wake_count`
- Process normally (create observation, etc.)

**Limits**: No hard cap. Accept all wakes. UI shows overage count for admin awareness.

**UI Handling**: Accordion for device shows count:
```
Device-002 (12 received / 10 expected) ⚠️ [Expand]
```

---

## RLS and Multi-Tenancy

### Security Model

All device submission tables use `company_id` for isolation:

```sql
CREATE POLICY "Users see in their company"
  ON {table_name} FOR SELECT TO authenticated
  USING (company_id = get_active_company_id());
```

### Active Company Context

- Super admins: Can switch companies via `set_active_company_context(company_id)`
- Regular users: Locked to `users.company_id`
- All queries filtered by `get_active_company_id()` function

### Testing RLS

```sql
-- As regular user (company A)
SELECT * FROM site_device_sessions;
-- Returns only company A sessions

-- As super admin (switched to company B)
SELECT set_active_company_context('company-b-uuid');
SELECT * FROM site_device_sessions;
-- Returns only company B sessions
```

---

## MQTT Protocol Integration

### Fixed Firmware Flows (DO NOT CHANGE)

1. **HELLO**: `device/{mac}/status` with `{ alive: 1, pending_count: N }`
2. **Metadata**: `device/{mac}/data` with capture details + telemetry
3. **Chunks**: `device/{mac}/data` with chunk_id + binary payload
4. **Retry**: `device/{mac}/ack` with missing_chunks array
5. **Success**: `device/{mac}/ack` with ACK_OK + next_wake timestamp

### Edge Function Responsibilities

**On HELLO**:
- Update `devices.last_seen_at`
- If `pending_count > 0`, queue send_image commands

**On Metadata**:
- Call `fn_wake_ingestion_handler()`
- Create device_images row (status = 'receiving')
- Initialize chunk tracker

**On Chunk**:
- Store chunk in temporary buffer
- Track received_chunk_ids
- After timeout or all received:
  - If missing → publish missing_chunks
  - Else → assemble + publish ACK_OK

**On ACK_OK**:
- Upload assembled image to storage
- Call `fn_image_completion_handler()`
- Include next_wake in response (per firmware spec)

**On Offline Recovery**:
- Loop through pending_count queue
- Issue sequential send_image commands
- On each success, call `fn_retry_by_id_handler()`

---

## Analytics Rollup Strategy

### Granularity Levels

1. **Per payload**: Individual device wake (finest grain)
2. **Per device**: Device trends over time
3. **Per session**: Site daily summary
4. **Per site**: Site trends over time
5. **Per program**: Program-level comparison (control vs experimental)
6. **Per company**: Company-wide rollup

### Query Patterns

**Device Trend (temperature over time)**:
```sql
SELECT
  captured_at::date AS date,
  AVG(temperature) AS avg_temp,
  MIN(temperature) AS min_temp,
  MAX(temperature) AS max_temp
FROM device_wake_payloads
WHERE device_id = :device_id
  AND captured_at >= NOW() - INTERVAL '30 days'
GROUP BY captured_at::date
ORDER BY date;
```

**Site Daily Summary**:
```sql
SELECT
  sds.session_date,
  sds.expected_wake_count,
  sds.completed_wake_count,
  sds.failed_wake_count,
  ROUND((sds.completed_wake_count::FLOAT / sds.expected_wake_count) * 100, 2) AS completeness_pct,
  AVG(dwp.temperature) AS avg_temp,
  AVG(dwp.humidity) AS avg_humidity
FROM site_device_sessions sds
LEFT JOIN device_wake_payloads dwp ON sds.session_id = dwp.site_device_session_id
WHERE sds.site_id = :site_id
  AND sds.session_date >= NOW() - INTERVAL '30 days'
GROUP BY sds.session_id, sds.session_date, sds.expected_wake_count,
         sds.completed_wake_count, sds.failed_wake_count
ORDER BY sds.session_date;
```

**Program Comparison (control vs experimental)**:
```sql
SELECT
  p.program_name,
  p.program_type, -- 'control' | 'experimental'
  COUNT(DISTINCT sds.session_id) AS total_sessions,
  AVG(sds.completed_wake_count) AS avg_completed_wakes,
  AVG(dwp.temperature) AS avg_temperature
FROM pilot_programs p
JOIN site_device_sessions sds ON p.program_id = sds.program_id
LEFT JOIN device_wake_payloads dwp ON sds.session_id = dwp.site_device_session_id
WHERE p.company_id = :company_id
  AND sds.session_date >= NOW() - INTERVAL '30 days'
GROUP BY p.program_id, p.program_name, p.program_type
ORDER BY p.program_type, p.program_name;
```

---

## Future Enhancements

### Planned (Post-Phase 6)

1. **Spatial Analytics**: Use `devices.x_position`, `y_position` for heatmaps
2. **Predictive Modeling**: ML forecasting of mold growth based on telemetry trends
3. **Time-Lapse Generation**: Auto-generate videos from daily image sequences
4. **Automated Reports**: Weekly/monthly PDF reports with charts and insights
5. **OTA Firmware Updates**: Push new firmware to devices with rollback support
6. **Advanced Alerting**: SMS/Email notifications with configurable thresholds

### Deferred

- Real-time websocket streaming of device data
- Mobile app for field technicians
- Customer-facing public dashboard
- Third-party API integrations (weather, pest management)

---

## Context Preservation Rules

**For Future Claude Sessions**:

1. **Always read this document first** before making device submission changes
2. **Never break retry-by-ID invariant**: Same row updates only, never duplicate
3. **Never override telemetry**: Device data is authoritative
4. **Never make sessions "incomplete"**: They are time-based containers
5. **Never skip RLS**: All new tables must use `get_active_company_id()`
6. **Never change MQTT protocol**: Firmware is fixed, adapt server-side
7. **Always maintain full lineage**: company → program → site → session → device → payload

---

## Version History

| Version | Date       | Changes                                    |
|---------|------------|--------------------------------------------|
| 1.0     | 2025-11-10 | Initial architecture document created      |

---

**Status**: ✅ Production Ready (Pending Deployment)
**Owner**: GasX Engineering Team
**Last Updated**: 2025-11-10
