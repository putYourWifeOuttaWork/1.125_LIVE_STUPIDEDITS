# Test MGI Flow with Real Image via MQTT

This guide shows how to test the complete MGI scoring flow using a real petri dish image sent through MQTT, simulating an actual device.

---

## Prerequisites

1. ✅ Database migration applied: `20251120000000_auto_calculate_mgi_velocity.sql`
2. ✅ MQTT service running (or webhook endpoint active)
3. ✅ At least one physical device registered in the system
4. ✅ Device assigned to a site and program

---

## Quick Start

### Step 1: Apply the Migration (if not done)

```bash
# In Supabase Dashboard → SQL Editor
# Run: supabase/migrations/20251120000000_auto_calculate_mgi_velocity.sql
```

### Step 2: Ensure MQTT Service is Running

**Option A: Local MQTT Service**
```bash
cd mqtt-service
npm install
npm start
```

**Option B: Check if Edge Function is Deployed**
```bash
# The mqtt_device_handler edge function should be deployed
# Check in Supabase Dashboard → Edge Functions
```

### Step 3: Run the Test Script

```bash
node test-mgi-real-image.mjs
```

---

## What the Test Does

The script performs a complete end-to-end test:

```
1. 📱 Finds an active physical device in your database
   ↓
2. 📥 Downloads a real petri dish image (with mold)
   ↓
3. 📡 Connects to HiveMQ Cloud MQTT broker
   ↓
4. 📤 Sends image via MQTT exactly like a real device:
   - HELLO message (status + telemetry)
   - Image metadata
   - Chunked image data (4KB chunks)
   - Finalize message
   ↓
5. 🔍 Monitors database for results:
   - device_images table (image upload)
   - petri_observations table (MGI scoring)
   ↓
6. ✅ Verifies complete flow:
   - MGI score from Roboflow (0.0-1.0)
   - Growth velocity calculated
   - MGI synced to device_images
```

---

## Expected Output

### Success Output:

```
🧪 MGI Real Image Test via MQTT

============================================================

📱 Step 1: Getting test device...
✅ Found device: Test Device 001
   MAC: AA:BB:CC:DD:EE:01
   Site ID: 123e4567-...
   Program ID: 987f6543-...

📥 Step 2: Downloading test petri dish image...
✅ Downloaded image: 125847 bytes

📡 Step 3: Connecting to MQTT broker...
✅ Connected to HiveMQ Cloud

📤 Sending image in 31 chunks...

   1️⃣  Sending HELLO message...
   2️⃣  Sending image metadata...
   3️⃣  Sending 31 image chunks...
      Progress: 31/31 chunks ✅
   4️⃣  Sending finalize message...
✅ Image transmission complete!

🔍 Step 4: Monitoring database for results...
   Waiting for image processing...

✅ [5s] Image found in device_images!
   Status: complete
   Image URL: https://...
   ✅ Image complete! Observation ID: abc123...

🎯 MGI SCORING COMPLETE!
   ═══════════════════════════════════════
   MGI Score: 45.2%
   Confidence: 92.5%
   Growth Velocity: +0.0623/day
   Scored At: 2025-11-20T...
   ═══════════════════════════════════════

✅ MGI synced to device_images (for snapshots)

🔬 Step 5: Verifying complete MGI flow...

📊 Recent MGI observations for this device:

   Date/Time              | MGI Score | Velocity  
   ──────────────────────────────────────────────
   11/20/2025, 3:45:23 PM |  45.2%   | +0.0623/day
   11/19/2025, 3:42:10 PM |  39.8%   | +0.0512/day

✅ Velocity calculation working! (comparing observations)

============================================================
✅ MGI FLOW TEST COMPLETE!
============================================================

What happened:
  1. ✅ Image sent via MQTT (like real device)
  2. ✅ Image assembled and uploaded to storage
  3. ✅ petri_observation created
  4. ✅ Roboflow scored the image
  5. ✅ Velocity auto-calculated
  6. ✅ MGI synced to device_images

🎯 Go to Submissions page to see the result!
```

---

## Troubleshooting

### Error: "No active physical devices found!"

**Solution:** Create a device first:
1. Go to Devices page in the app
2. Click "Register New Device"
3. Enter a MAC address like: `AA:BB:CC:DD:EE:01`
4. Assign to a site and program
5. Save and run test again

### Error: "MQTT connection timeout"

**Possible causes:**
1. MQTT service not running
2. HiveMQ credentials incorrect
3. Network/firewall issues

**Solution:**
```bash
# Check MQTT service
cd mqtt-service
npm start

# Or verify edge function is deployed
# Supabase Dashboard → Edge Functions → mqtt_device_handler
```

### Error: "MGI scoring did not complete"

**Check async_error_logs:**
```sql
SELECT * FROM async_error_logs
WHERE trigger_name = 'trg_auto_score_mgi_image'
ORDER BY created_at DESC
LIMIT 5;
```

**Common issues:**
1. Roboflow API key not configured
2. pg_net extension not enabled
3. Edge function not deployed

**Solution:**
```sql
-- Check if pg_net is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- If not, enable it (requires superuser)
-- Contact Supabase support or use dashboard
```

### Timeout waiting for results

The script waits up to 2 minutes. If MGI scoring takes longer:

1. **Check Roboflow API status**
2. **Check edge function logs** in Supabase Dashboard
3. **Verify trigger is active:**
   ```sql
   SELECT trigger_name, event_object_table
   FROM information_schema.triggers
   WHERE trigger_name = 'trigger_auto_score_mgi_image';
   ```

---

## Manual Testing Steps

If the automated script doesn't work, test manually:

### 1. Check if image reached device_images:

```sql
SELECT 
  image_id,
  image_name,
  status,
  image_url,
  observation_id
FROM device_images
WHERE device_id = 'YOUR-DEVICE-ID'
ORDER BY created_at DESC
LIMIT 5;
```

### 2. Check if observation was created:

```sql
SELECT 
  observation_id,
  image_url,
  mgi_score,
  growth_velocity
FROM petri_observations
WHERE device_id = 'YOUR-DEVICE-ID'
ORDER BY created_at DESC
LIMIT 5;
```

### 3. Manually trigger MGI scoring:

```sql
-- Call the edge function directly
SELECT net.http_post(
  url := current_setting('app.supabase_url') || '/functions/v1/score_mgi_image',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
  ),
  body := jsonb_build_object(
    'image_id', 'YOUR-IMAGE-ID',
    'image_url', 'YOUR-IMAGE-URL'
  )
);
```

### 4. Check for errors:

```sql
SELECT * FROM async_error_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

---

## Testing Velocity Calculation

To test velocity calculation, you need **at least 2 observations** from the same device:

### Run test twice (1 day apart):

```bash
# Day 1
node test-mgi-real-image.mjs

# Day 2 (or wait 24 hours)
node test-mgi-real-image.mjs
```

### Or backfill with different timestamps:

```sql
-- Insert test observation from "yesterday"
INSERT INTO petri_observations (
  device_id,
  site_id,
  program_id,
  company_id,
  image_url,
  order_index,
  is_device_generated,
  mgi_score,
  created_at
) VALUES (
  'YOUR-DEVICE-ID',
  'YOUR-SITE-ID',
  'YOUR-PROGRAM-ID',
  'YOUR-COMPANY-ID',
  'https://example.com/test.jpg',
  1,
  true,
  0.35,  -- 35% MGI score
  NOW() - INTERVAL '1 day'
);

-- Then run test to create today's observation
-- Velocity will be auto-calculated!
```

---

## Verify Complete Flow

After successful test, verify in the UI:

### 1. Go to Submissions Page

✅ Should see new submission from test device  
✅ MGI score displayed (color-coded)  
✅ Velocity shown in details  

### 2. Check Site Map (if device has coordinates)

✅ Device node colored by MGI  
✅ Pulse animation active  
✅ Pulse size/speed based on velocity  
✅ Voronoi zones colored by MGI  

### 3. Check Device Detail Page

✅ Latest MGI score displayed  
✅ MGI trend over time  
✅ Velocity history  

---

## Next Steps After Successful Test

1. ✅ **Deploy to production** - Migration is safe to apply
2. ✅ **Configure real device** - Use actual ESP32-CAM hardware
3. ✅ **Set up monitoring** - Watch async_error_logs regularly
4. ✅ **Test with multiple devices** - Verify multi-tenancy works
5. ✅ **Tune Roboflow** - Adjust model if needed for accuracy

---

## Files

- **`test-mgi-real-image.mjs`** - This test script
- **`supabase/migrations/20251120000000_auto_calculate_mgi_velocity.sql`** - Migration
- **`MGI_AUTO_VELOCITY_CASCADE_COMPLETE.md`** - Complete documentation
- **`supabase/functions/score_mgi_image/index.ts`** - Roboflow scoring function

---

## Support

If issues persist:

1. Check Supabase logs (Dashboard → Logs)
2. Check MQTT service logs (`mqtt-service/`)
3. Check edge function logs (Dashboard → Edge Functions → Logs)
4. Review `async_error_logs` table
5. Verify all migrations applied correctly

---

**Ready to test? Run:**
```bash
node test-mgi-real-image.mjs
```

🎯 **Good luck!**
