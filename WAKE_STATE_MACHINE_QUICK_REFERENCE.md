# Wake State Machine Quick Reference

## Protocol States

| State | Meaning | Next Step |
|-------|---------|-----------|
| `hello_received` | Device sent HELLO | Send ACK + SNAP |
| `ack_sent` | ACK acknowledged | Send SNAP command |
| `snap_sent` | SNAP command sent | Wait for metadata |
| `metadata_received` | Got metadata, image assembling | Send SLEEP when complete |
| `complete` | SLEEP sent, wake finished | Wake cycle done ✅ |
| `failed` | Protocol error occurred | Investigate logs |
| `sleep_only` | Unmapped device, no image | Device sleeps until mapped |

## Protocol Flow

### Normal Flow (Provisioned Device)
```
HELLO → ack_sent → snap_sent → metadata_received → complete
```

### Unmapped Device Flow
```
HELLO → sleep_only
```

## Key Functions

### Check Wake Status
```sql
SELECT
  device_id,
  protocol_state,
  server_image_name,
  ack_sent_at,
  snap_sent_at,
  sleep_sent_at,
  is_complete
FROM device_wake_payloads
WHERE device_id = 'YOUR_DEVICE_ID'
ORDER BY captured_at DESC
LIMIT 10;
```

### Find Stuck Wakes
```sql
SELECT
  payload_id,
  device_id,
  protocol_state,
  captured_at,
  EXTRACT(EPOCH FROM (NOW() - captured_at))/60 as minutes_stuck
FROM device_wake_payloads
WHERE protocol_state NOT IN ('complete', 'failed', 'sleep_only')
  AND captured_at < NOW() - INTERVAL '5 minutes'
ORDER BY captured_at;
```

### View Protocol Timing
```sql
SELECT
  payload_id,
  protocol_state,
  EXTRACT(EPOCH FROM (ack_sent_at - captured_at)) as hello_to_ack_sec,
  EXTRACT(EPOCH FROM (snap_sent_at - ack_sent_at)) as ack_to_snap_sec,
  EXTRACT(EPOCH FROM (sleep_sent_at - snap_sent_at)) as snap_to_sleep_sec
FROM device_wake_payloads
WHERE protocol_state = 'complete'
  AND captured_at > NOW() - INTERVAL '1 day'
ORDER BY captured_at DESC;
```

## Schedule Inheritance

**Device has schedule:** Uses device schedule
```sql
UPDATE devices SET wake_schedule_cron = '0 */4 * * *' WHERE device_id = '...';
-- Device wakes every 4 hours
```

**Device inherits from site:** Falls back to site schedule
```sql
UPDATE devices SET wake_schedule_cron = NULL WHERE device_id = '...';
UPDATE sites SET wake_schedule_cron = '0 8,16 * * *' WHERE site_id = '...';
-- Device uses site schedule: 8AM and 4PM
```

**No schedule:** Uses default fallback (8:00AM)
```sql
-- Both device and site have NULL schedule
-- System uses '8:00AM' as default next wake
```

## Common Issues

### Wake Stuck in `snap_sent`
**Cause:** Device didn't receive SNAP command or failed to capture
**Fix:**
1. Check device is online
2. Verify MQTT connectivity
3. Check device logs for capture errors

### Wake Stuck in `metadata_received`
**Cause:** Chunks not arriving or incomplete
**Fix:**
1. Check chunk assembly progress
2. Look for missing chunks in device_wake_payloads
3. May need to request missing chunks

### Device Shows `sleep_only`
**Cause:** Device is unmapped (site_id = NULL)
**Fix:**
1. Map device to a site
2. Device will capture images on next wake

## Monitoring Queries

### Wake Success Rate (Last 24h)
```sql
SELECT
  protocol_state,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM device_wake_payloads
WHERE captured_at > NOW() - INTERVAL '24 hours'
GROUP BY protocol_state
ORDER BY count DESC;
```

### Average Protocol Timing
```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (sleep_sent_at - captured_at))) as avg_total_seconds,
  MIN(EXTRACT(EPOCH FROM (sleep_sent_at - captured_at))) as min_total_seconds,
  MAX(EXTRACT(EPOCH FROM (sleep_sent_at - captured_at))) as max_total_seconds
FROM device_wake_payloads
WHERE protocol_state = 'complete'
  AND captured_at > NOW() - INTERVAL '7 days';
```

### Devices by Protocol State
```sql
SELECT
  d.device_name,
  dwp.protocol_state,
  dwp.captured_at,
  dwp.server_image_name
FROM device_wake_payloads dwp
JOIN devices d ON d.device_id = dwp.device_id
WHERE dwp.captured_at > NOW() - INTERVAL '1 hour'
ORDER BY dwp.captured_at DESC;
```

## Troubleshooting

### Reset Stuck Wake
```sql
-- Mark as failed to allow retry
UPDATE device_wake_payloads
SET
  protocol_state = 'failed',
  payload_status = 'failed'
WHERE payload_id = 'STUCK_PAYLOAD_ID';
```

### Manual SLEEP Command
```sql
-- If wake is stuck and device needs to sleep
-- Use mqtt-service to publish sleep command manually
-- Topic: ESP32CAM/{mac}/cmd
-- Payload: {"device_id": "{mac}", "next_wake": "8:00AM"}
```

### Check Next Wake Calculation
```sql
SELECT
  d.device_name,
  d.wake_schedule_cron as device_schedule,
  s.wake_schedule_cron as site_schedule,
  d.last_wake_at,
  d.next_wake_at,
  d.next_wake_at - NOW() as time_until_wake
FROM devices d
LEFT JOIN sites s ON s.site_id = d.site_id
WHERE d.device_id = 'YOUR_DEVICE_ID';
```

## Migration Application

The protocol state tracking migration is located at:
```
supabase/migrations/20260103220000_add_protocol_state_to_wake_payloads.sql
```

To apply (already done in this session):
1. Migration adds 5 new columns to device_wake_payloads
2. Existing rows are migrated to appropriate states
3. Index created for fast state queries

## Key Points

✅ **One image per wake** (current implementation)
✅ **Unmapped devices handled** (no data loss)
✅ **Schedule inheritance** (device → site → default)
✅ **Next wake updates** (advances after successful session)
✅ **Complete state tracking** (timestamps for every step)

## Contact

For issues or questions about the wake state machine:
- Check logs in Supabase Edge Function: `mqtt_device_handler`
- Review device audit log in `device_audit_log` table
- Monitor protocol states in `device_wake_payloads`
