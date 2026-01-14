# Image Resume - Deployment Instructions

## What Was Implemented

Firmware-managed image resume support. Devices can now resume interrupted image transfers across multiple wake sessions without losing progress.

**Key Principle:** Server detects and adapts to resumed transfers. Firmware manages its own queue.

## Files Modified

### 1. Database Migration
- **File:** `APPLY_IMAGE_RESUME_MIGRATION.sql`
- **Changes:** Adds unique constraint, creates helper functions, adds duplicate logging

### 2. MQTT Service
- **File:** `mqtt-service/index.js`
- **Function:** `handleMetadataMessage()`
- **Changes:** Three-path logic: new image (INSERT), complete image (log duplicate), incomplete image (UPDATE and resume)

### 3. Edge Function
- **File:** `supabase/functions/mqtt_device_handler_bundled/index.ts`
- **Functions:** `handleMetadata()`, `handleHelloStatus()`
- **Changes:** Resume detection, duplicate handling, simplified HELLO logic

### 4. Documentation
- **File:** `IMAGE_RESUME_IMPLEMENTATION_COMPLETE.md`
- **Content:** Complete implementation details, testing guide, monitoring queries

## Deployment Steps

### Step 1: Apply Database Migration

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy contents of `APPLY_IMAGE_RESUME_MIGRATION.sql`
4. Execute the migration
5. Verify success messages in output

**Expected Output:**
```
Added UNIQUE constraint on device_images(device_id, image_name)
=== Image Resume Migration Complete ===
Incomplete images in database: X
Duplicate logs recorded: 0
Resume system is now active!
```

### Step 2: Deploy Edge Function

```bash
# From project root
cd supabase/functions/mqtt_device_handler_bundled

# Deploy via Supabase CLI or dashboard
# The bundled version is ready to deploy as-is
```

### Step 3: Restart MQTT Service

```bash
# SSH to server running mqtt-service
cd mqtt-service

# Stop current service
pm2 stop mqtt-service

# Start with updated code
pm2 start index.js --name mqtt-service

# Verify it's running
pm2 logs mqtt-service
```

### Step 4: Verify Deployment

**Check Logs for Resume Activity:**

MQTT Service logs:
```
[METADATA] Resuming incomplete image transfer: image_X.jpg (50/100 chunks already received)
```

Edge Function logs (via Supabase Dashboard):
```
[Ingest] Resume detected - continuing image transfer
```

**Check Database:**
```sql
-- View incomplete images
SELECT * FROM incomplete_images_report;

-- Check for resume activity (should see protocol_state = 'metadata_received_resume')
SELECT
  payload_id,
  device_id,
  protocol_state,
  image_id,
  captured_at
FROM device_wake_payloads
WHERE protocol_state = 'metadata_received_resume'
ORDER BY captured_at DESC
LIMIT 10;
```

### Step 5: Test with Real Device

1. **Start fresh image transfer:**
   - Device captures image
   - Server receives metadata
   - Disconnect device after 30 chunks received

2. **Resume transfer:**
   - Device reconnects (will report pendingImg=1)
   - Device sends same image_name metadata
   - Server logs: "Resuming incomplete image transfer"
   - Device continues sending from chunk 31
   - Server assembles all chunks successfully

3. **Verify completion:**
   - Check device_images.status = 'complete'
   - Check image URL is accessible
   - Check all chunks counted correctly

## Rollback Plan

If issues occur, revert in reverse order:

1. **Restart mqtt-service with old code:**
   ```bash
   git checkout HEAD~1 mqtt-service/index.js
   pm2 restart mqtt-service
   ```

2. **Redeploy old edge function:**
   - Revert `mqtt_device_handler_bundled/index.ts`
   - Deploy previous version

3. **Database rollback (OPTIONAL):**
   - Unique constraint can stay (doesn't break anything)
   - New tables and functions are unused if code is reverted
   - Only drop if absolutely necessary

## Monitoring Queries

**Incomplete Images:**
```sql
SELECT * FROM incomplete_images_report
ORDER BY updated_at DESC;
```

**Resume Activity (Last 24 Hours):**
```sql
SELECT
  d.device_code,
  di.image_name,
  di.received_chunks,
  di.total_chunks,
  di.status,
  di.updated_at
FROM device_images di
JOIN devices d ON di.device_id = d.device_id
WHERE di.updated_at > NOW() - INTERVAL '24 hours'
  AND di.status IN ('receiving', 'complete')
ORDER BY di.updated_at DESC;
```

**Duplicates (Firmware Bugs):**
```sql
SELECT
  d.device_code,
  dl.image_name,
  dl.duplicate_received_at,
  dl.duplicate_metadata->>'total_chunks' as chunks
FROM duplicate_images_log dl
JOIN devices d ON dl.device_id = d.device_id
ORDER BY dl.duplicate_received_at DESC
LIMIT 20;
```

## Success Criteria

✅ Migration applied without errors
✅ MQTT service restarted successfully
✅ Edge function deployed successfully
✅ No TypeScript errors (build passes)
✅ Resume detection logs appear
✅ Test device successfully resumes transfer
✅ No duplicate image records created
✅ Complete images remain intact

## Support

If issues occur:
1. Check logs: `pm2 logs mqtt-service`
2. Check Supabase edge function logs
3. Query `incomplete_images_report` view
4. Check for errors in device_images inserts

## Status

**Build Status:** ✅ PASSING (no TypeScript errors)
**Migration Status:** ⏳ READY TO APPLY
**Deployment Status:** ⏳ READY TO DEPLOY

Ready for production deployment. All code changes complete and tested locally.
