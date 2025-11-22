# Deploy Roboflow MGI Integration - Quick Start

## What Was Done

✅ **Edge Function Fixed** - `supabase/functions/score_mgi_image/index.ts` updated with:
- Correct Roboflow API call: `param2: "MGI"`
- Correct response parsing: `[{ "MGI": "0.05" }]`
- Device-centric updates: writes to `device_images` only (no petri_observations)

⚠️ **Database Migration Ready** - Waiting to be applied

---

## Deploy in 3 Steps

### Step 1: Deploy Edge Function

The edge function has been updated in your local files. Deploy it:

```bash
# From project root
npx supabase functions deploy score_mgi_image
```

**Or** commit and let your CI/CD deploy automatically.

---

### Step 2: Apply Database Migration

**Option A: Via Supabase Dashboard**
1. Go to https://supabase.com/dashboard/project/nkecewxlwkqtxbvytjjb/sql
2. Open `/tmp/fix_roboflow_mgi_integration.sql`
3. Copy entire contents
4. Paste into SQL Editor
5. Click "Run"

**Option B: Via Supabase CLI**
```bash
# Copy migration to migrations folder
cp /tmp/fix_roboflow_mgi_integration.sql \
   supabase/migrations/20251122000000_fix_roboflow_mgi_integration.sql

# Apply migration
npx supabase db push
```

---

### Step 3: Configure Database Settings

Run this SQL in Supabase SQL Editor:

```sql
-- Set Supabase URL and service role key for trigger
ALTER DATABASE postgres SET app.supabase_url = 'https://nkecewxlwkqtxbvytjjb.supabase.co';
ALTER DATABASE postgres SET app.supabase_service_role_key = 'YOUR_SERVICE_ROLE_KEY_HERE';

-- Reload configuration
SELECT pg_reload_conf();
```

**Get your service role key:**
1. Go to https://supabase.com/dashboard/project/nkecewxlwkqtxbvytjjb/settings/api
2. Copy "service_role" key (secret)
3. Replace `YOUR_SERVICE_ROLE_KEY_HERE` in SQL above

---

## Test It Works

### Quick Test - Manual Edge Function Call

```bash
# Get an existing image_id from device_images table
# Replace IMAGE_ID and IMAGE_URL with real values

curl -X POST https://nkecewxlwkqtxbvytjjb.supabase.co/functions/v1/score_mgi_image \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "image_id": "IMAGE_ID",
    "image_url": "IMAGE_URL"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "image_id": "...",
  "mgi_score": 0.05
}
```

### Full Test - Automatic Trigger

1. Send MQTT message from device with image
2. Wait for image to complete
3. Check database:

```sql
SELECT
  image_id,
  device_id,
  mgi_score,
  mgi_velocity,
  mgi_speed,
  mgi_scoring_status,
  mgi_scored_at
FROM device_images
WHERE captured_at > NOW() - INTERVAL '1 hour'
ORDER BY captured_at DESC
LIMIT 5;
```

Should see:
- `mgi_scoring_status` = `'complete'`
- `mgi_score` = numeric value (0.0 - 1.0)
- `mgi_velocity` and `mgi_speed` calculated

4. Check rollup to devices:

```sql
SELECT
  device_id,
  device_name,
  latest_mgi_score,
  latest_mgi_velocity,
  latest_mgi_at
FROM devices
WHERE latest_mgi_at > NOW() - INTERVAL '1 hour';
```

---

## Monitor Status

### Check Scoring Status
```sql
SELECT
  mgi_scoring_status,
  COUNT(*) as count
FROM device_images
WHERE status = 'complete'
GROUP BY mgi_scoring_status;
```

### Check Failed Images
```sql
SELECT
  image_id,
  device_id,
  mgi_scoring_status,
  roboflow_response->'error' as error
FROM device_images
WHERE mgi_scoring_status IN ('failed', 'in_progress')
ORDER BY received_at DESC;
```

### Manually Retry Failed
```sql
SELECT * FROM fn_retry_failed_mgi_scoring();
```

---

## Troubleshooting

### Edge Function Returns Error
**Check:** Is Roboflow API key correct?
- Key in code: `VD3fJI17y2IgnbOhYmvu`
- Test API directly first (see ROBOFLOW_MGI_INTEGRATION_COMPLETE.md)

### Trigger Not Firing
**Check:** Are database settings configured?
```sql
SELECT name, setting FROM pg_settings
WHERE name IN ('app.supabase_url', 'app.supabase_service_role_key');
```

**Check:** Is pg_net extension enabled?
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_net';
```

### MGI Score Not Calculating Velocity
**Check:** Does trigger exist?
```sql
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'device_images'::regclass
AND tgname = 'trigger_calculate_and_rollup_mgi';
```

---

## What Happens After Deployment

**Automatic Flow:**
1. Device sends image via MQTT
2. Image completes → status = 'complete'
3. Trigger calls Roboflow edge function
4. Roboflow scores image → returns MGI value
5. MGI score saved to `device_images.mgi_score`
6. Velocity/speed auto-calculated
7. Latest values rolled up to `devices` table
8. Snapshots regenerated (if trigger exists)
9. Alerts checked (if trigger exists)
10. UI shows updated MGI values on maps/charts

**No Manual Steps Required!**

---

## Support

If something doesn't work:

1. Check edge function logs:
   - Go to Supabase Dashboard → Edge Functions → score_mgi_image → Logs

2. Check database logs:
   ```sql
   SELECT * FROM async_error_logs
   WHERE trigger_name = 'score_mgi_image'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

3. Check trigger fired:
   - Look for NOTICE in Supabase logs: "Triggered MGI scoring for image: ..."

---

## Files Changed

- ✅ `supabase/functions/score_mgi_image/index.ts` - Ready to deploy
- ⚠️ `/tmp/fix_roboflow_mgi_integration.sql` - Ready to apply
- 📄 `ROBOFLOW_MGI_INTEGRATION_COMPLETE.md` - Full documentation

**Ready to deploy!** 🚀
