# Deploy Bundled MQTT Device Handler v3.4.0

## What's New in v3.4.0

### Pending Image Resume Support
- **Automatic Detection**: When device reports `pendingImg > 0`, server checks database for incomplete images
- **Smart Resume**: Sends ACK with empty `ACK_OK` object to tell device to continue sending incomplete image
- **Protocol State Tracking**: New `ack_pending_sent` state tracks resumed transfers
- **Database-Backed Recovery**: Uses `device_images` table to find oldest incomplete image

### How It Works

1. **Device wakes up** and sends HELLO with `pendingImg: 1`
2. **Server queries database** for incomplete images (`status = 'receiving'` or `'pending'`)
3. **If found**: 
   - Updates `device_wake_payloads.protocol_state = 'ack_pending_sent'`
   - Sends ACK for pending image (empty ACK_OK)
   - Device resumes sending chunks for that image
4. **If not found**: Normal flow (new image capture)

## Deployment Steps

### 1. Apply Database Migration

First, apply the protocol state migration in Supabase Dashboard:

**File**: `APPLY_PENDING_IMAGE_PROTOCOL_STATE.sql`

1. Open Supabase Dashboard → SQL Editor
2. Copy entire contents of `APPLY_PENDING_IMAGE_PROTOCOL_STATE.sql`
3. Paste and execute
4. Verify success (should complete without errors)

**What it does**:
- Creates `protocol_state` column and related tracking columns
- Adds `ack_pending_sent` to allowed states
- Migrates existing data
- Creates index for efficient queries

### 2. Deploy Edge Function

Deploy the bundled version using Supabase CLI or Dashboard:

#### Option A: Using Supabase Dashboard (Recommended)

1. Open Supabase Dashboard → Edge Functions
2. Find `mqtt_device_handler_bundled` (or create new function)
3. Copy contents of `supabase/functions/mqtt_device_handler_bundled/index.ts`
4. Paste into editor
5. Click "Deploy"

#### Option B: Using Supabase CLI

```bash
# Make sure you're in the project root
cd /path/to/project

# Deploy the bundled function
supabase functions deploy mqtt_device_handler_bundled \
  --project-ref YOUR_PROJECT_REF
```

### 3. Verify Deployment

Test the deployed function:

```bash
# Get function info
curl https://YOUR_PROJECT.supabase.co/functions/v1/mqtt_device_handler_bundled

# Expected response:
{
  "success": true,
  "message": "MQTT Device Handler V3 (HTTP Webhook Mode) - BUNDLED",
  "version": "3.4.0-bundled",
  "phase": "Phase 3 - HTTP Webhook Integration + Pending Image Resume",
  "features": [
    "Pending image detection and resume",
    "Protocol state tracking (ack_pending_sent)",
    "Database-backed chunk recovery"
  ]
}
```

### 4. Update Local MQTT Service

Make sure your local MQTT service forwards messages to the new endpoint:

```javascript
// In mqtt-service/index.js or similar
const EDGE_FUNCTION_URL = 'https://YOUR_PROJECT.supabase.co/functions/v1/mqtt_device_handler_bundled';
```

## Testing Pending Image Resume

### Create Test Scenario

1. **Start an image transfer** from a device
2. **Interrupt it** (power off device mid-transfer)
3. **Verify incomplete image** in database:
   ```sql
   SELECT image_id, image_name, status, received_chunks, total_chunks
   FROM device_images
   WHERE status IN ('pending', 'receiving')
   ORDER BY captured_at DESC;
   ```
4. **Power on device** - it should report `pendingImg: 1`
5. **Watch logs** - should see "PENDING IMAGE DETECTED - Resuming transfer"
6. **Device resumes** sending chunks from where it left off

### Expected Log Output

```
[Ingest] HELLO from device: ESP32-001 MAC: 98A316F82928 pending: 1
[Ingest] Device lineage resolved: {...}
[Ingest] Wake payload created: abc-123 state: hello_received
[Ingest] PENDING IMAGE DETECTED - Resuming transfer: 98A316F82928_1234567890.jpg (15/47 chunks)
[ACK] Pending image ACK tracked for: {device: 98A316F82928, image: 98A316F82928_1234567890.jpg}
[Ingest] Pending image ACK sent - device will continue transfer
```

## Monitoring

### Check Protocol States

```sql
-- View wake payloads with protocol states
SELECT 
  payload_id,
  device_id,
  protocol_state,
  server_image_name,
  ack_sent_at,
  snap_sent_at,
  sleep_sent_at,
  is_complete
FROM device_wake_payloads
WHERE protocol_state = 'ack_pending_sent'
ORDER BY captured_at DESC
LIMIT 10;
```

### Check ACK Audit Log

```sql
-- View pending image ACKs
SELECT 
  ack_log_id,
  device_mac,
  image_name,
  ack_type,
  mqtt_success,
  logged_at
FROM device_ack_log
WHERE ack_type = 'PENDING_IMAGE_ACK'
ORDER BY logged_at DESC
LIMIT 10;
```

## Troubleshooting

### Device Not Resuming

**Check**:
1. Does database have incomplete image for this device?
   ```sql
   SELECT * FROM device_images 
   WHERE device_id = 'YOUR_DEVICE_ID' 
   AND status IN ('pending', 'receiving');
   ```
2. Is device reporting `pendingImg > 0` in HELLO message?
3. Check edge function logs for "PENDING IMAGE DETECTED" message

### ACK Not Sent

**Check**:
1. Edge function logs for errors
2. Device ACK audit log:
   ```sql
   SELECT * FROM device_ack_log 
   WHERE ack_type = 'PENDING_IMAGE_ACK' 
   ORDER BY logged_at DESC;
   ```

### Wrong Image Resume

**Issue**: Device reports pending, but server can't find incomplete image

**Solution**: Incomplete images may have been cleaned up. Device will timeout and start fresh capture.

## Rollback Plan

If issues occur, rollback to previous version:

1. Redeploy previous version of edge function
2. Optionally revert migration (removes `protocol_state` column):
   ```sql
   ALTER TABLE device_wake_payloads DROP COLUMN IF EXISTS protocol_state CASCADE;
   ALTER TABLE device_wake_payloads DROP COLUMN IF EXISTS server_image_name CASCADE;
   ALTER TABLE device_wake_payloads DROP COLUMN IF EXISTS ack_sent_at CASCADE;
   ALTER TABLE device_wake_payloads DROP COLUMN IF EXISTS snap_sent_at CASCADE;
   ALTER TABLE device_wake_payloads DROP COLUMN IF EXISTS sleep_sent_at CASCADE;
   ```

## Files Modified

- ✅ `supabase/functions/mqtt_device_handler_bundled/index.ts` - Added pending image resume
- ✅ `APPLY_PENDING_IMAGE_PROTOCOL_STATE.sql` - Complete protocol state setup
- ✅ `DEPLOY_PENDING_IMAGE_RESUME.md` - Original deployment guide (for modular version)
- ✅ `PENDING_IMAGE_FAQ.md` - Questions and answers
- ✅ `PENDING_IMAGE_RESUME_IMPLEMENTATION.md` - Technical details

## Support

For issues or questions:
1. Check edge function logs in Supabase Dashboard
2. Review device ACK audit log
3. Check device MQTT message log for protocol flow
4. Verify migration was applied successfully

## Version History

- **v3.4.0** - Pending image resume support (Jan 2026)
- **v3.3.1** - HTTP webhook mode bundled
- **v3.3.0** - Protocol compliance improvements
- **v3.0.0** - Phase 3 HTTP webhook integration
