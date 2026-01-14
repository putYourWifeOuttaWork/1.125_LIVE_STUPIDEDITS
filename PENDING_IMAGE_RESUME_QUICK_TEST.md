# Pending Image Resume - Quick Testing Guide

## Quick Test Commands

### 1. Check Current Pending Images

```sql
-- Find devices with incomplete images
SELECT
  d.device_code,
  d.device_mac,
  di.image_name,
  di.status,
  di.received_chunks || '/' || di.total_chunks as progress,
  di.captured_at
FROM device_images di
JOIN devices d ON d.device_id = di.device_id
WHERE di.status IN ('pending', 'receiving')
ORDER BY di.captured_at ASC;
```

### 2. Create Test Pending Image

```sql
-- Create a test pending image for device
INSERT INTO device_images (
  device_id,
  image_name,
  image_size,
  captured_at,
  total_chunks,
  received_chunks,
  status,
  metadata
)
SELECT
  device_id,
  'test_pending_' || extract(epoch from now()) || '.jpg',
  204800,
  now() - interval '5 minutes',
  25,
  12,
  'receiving',
  '{"test": true, "temperature": 72.5, "humidity": 55}'::jsonb
FROM devices
WHERE device_mac = 'YOUR_DEVICE_MAC_HERE'  -- Replace with actual MAC
LIMIT 1;
```

### 3. Simulate Device Wake with Pending Images

```bash
# Replace MAC address with your test device
mosquitto_pub -h 1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud \
  -p 8883 -u BrainlyTesting -P 'BrainlyTest@1234' \
  --capath /etc/ssl/certs/ \
  -t "ESP32CAM/98A316F82928/status" \
  -m '{"device_id":"98A316F82928","device_mac":"98:A3:16:F8:29:28","pendingImg":2,"battery_voltage":3.95,"wifi_rssi":-45,"temperature":25.5,"humidity":55}'
```

### 4. Check ACK Log

```sql
-- View recent ACK messages
SELECT
  dal.ack_sent_at,
  d.device_code,
  dal.image_name,
  dal.ack_type,
  dal.message_payload->>'device_id' as device_id,
  dal.message_payload->>'ACK_OK' as ack_ok
FROM device_ack_log dal
JOIN devices d ON d.device_id = dal.device_id
ORDER BY dal.ack_sent_at DESC
LIMIT 10;
```

### 5. Monitor Service Logs

```bash
# If running directly
tail -f mqtt-service/logs/service.log | grep -E '\[ACK\]|\[STATUS\]|\[CMD\]'

# If using Docker
docker logs mqtt-service -f --tail 50 | grep -E '\[ACK\]|\[STATUS\]|\[CMD\]'
```

## Expected Log Patterns

### Scenario A: Pending Image Found → ACK Sent
```
[STATUS] Device reports 2 pending images - checking database...
[STATUS] Found pending image test_pending_1705334567.jpg in DB for resume (12/25 chunks)
[ACK] Resuming pending image test_pending_1705334567.jpg for device 98A316F82928
[ACK] Sent resume ACK for test_pending_1705334567.jpg to 98A316F82928 on ESP32CAM/98A316F82928/ack
[ACK] Logged resume ACK to database for test_pending_1705334567.jpg
```

### Scenario B: Pending Reported But Not Found → Fallback
```
[STATUS] Device reports 1 pending images - checking database...
[STATUS] Device reports 1 pending but none found in DB - will send capture_image as fallback
[CMD] Device reports 1 pending but none in DB - sending capture_image as fallback
```

### Scenario C: No Pending → Normal Flow
```
[STATUS] Device has no pending images - will capture new image
[CMD] No pending images - sending capture_image for new capture
```

## Cleanup Test Data

```sql
-- Remove test pending images
DELETE FROM device_images
WHERE image_name LIKE 'test_pending_%'
  AND status IN ('pending', 'receiving');

-- Remove test ACK logs
DELETE FROM device_ack_log
WHERE ack_type = 'resume_pending'
  AND ack_sent_at > now() - interval '1 hour';
```

## Quick Verification Checklist

- [ ] Pending image found in DB → ACK sent
- [ ] ACK logged to `device_ack_log` table
- [ ] Image status updated to 'receiving'
- [ ] Correct log messages in service output
- [ ] Fallback works when pending reported but not in DB
- [ ] Normal flow works when no pending images

## Restart Service

```bash
# After deploying changes
sudo systemctl restart mqtt-service

# Or if using Docker
docker restart mqtt-service

# Or if running directly
pkill -f "node mqtt-service/index.js" && node mqtt-service/index.js
```

## Common Issues

### Issue: ACK sent but device doesn't resume
- Check MQTT topic format: `ESP32CAM/{MAC}/ack`
- Verify MAC address normalization (uppercase, no separators)
- Check device firmware supports resume protocol

### Issue: No pending images found in DB
- Verify `status IN ('pending', 'receiving')`
- Check `device_id` matches correctly
- Ensure image wasn't already completed or timed out

### Issue: Database query error
- Verify `device_images` table exists
- Check `device_ack_log` table exists
- Ensure service role key has proper permissions

---

**Quick Start**: Create test pending image → Simulate device wake → Check logs → Verify ACK sent
