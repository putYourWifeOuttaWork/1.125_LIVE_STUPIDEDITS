# Roboflow MGI Scoring Integration

**Automated Mold Growth Index (MGI) scoring using Roboflow AI**

---

## **Overview**

This integration automatically scores petri dish images for mold growth using Roboflow's custom workflow. Scores are normalized to 0.0-1.0 and stored in the database for velocity and speed calculations.

---

## **Architecture**

```
Device Image Completion
         ↓
Database Trigger (device_images)
         ↓
Edge Function: score_mgi_image
         ↓
Roboflow API Call
         ↓
Parse Response (1-100% → 0.0-1.0)
         ↓
Update petri_observations
         ↓
Calculate Velocity/Speed (RPC functions)
```

---

## **Components**

### **1. Edge Function: score_mgi_image**

**File:** `supabase/functions/score_mgi_image/index.ts`

**Purpose:** Call Roboflow API with image URL and store MGI score

**API Details:**
- **URL:** `https://serverless.roboflow.com/invivo/workflows/custom-workflow`
- **API Key:** `VD3fJI17y2IgnbOhYmvu`
- **Method:** POST
- **Payload:**
  ```json
  {
    "api_key": "VD3fJI17y2IgnbOhYmvu",
    "inputs": {
      "image": {"type": "url", "value": "IMAGE_URL"},
      "param": "1-100% only"
    }
  }
  ```

**Response Format:**
```json
{
  "outputs": [
    {
      "mgi_score": 75,
      "confidence": 0.92
    }
  ]
}
```

**Normalization:** Score is divided by 100 to convert to 0.0-1.0 range

**Error Handling:**
- Logs to `async_error_logs` if no score returned
- Returns success: false if Roboflow API fails
- Does not block device_images completion

---

### **2. Database Schema**

**Migration File:** `supabase/migrations/20251113000002_mgi_scoring_and_velocity.sql`

**New Columns on petri_observations:**
- `mgi_score` (numeric 0.0-1.0) - Normalized MGI score
- `mgi_confidence` (numeric 0.0-1.0) - AI confidence level
- `mgi_scored_at` (timestamptz) - When scoring completed

**Indexes:**
- `idx_petri_observations_mgi_score` - For score queries
- `idx_petri_observations_mgi_scored_at` - For time-based queries

---

### **3. Auto-Scoring Trigger**

**Function:** `trg_auto_score_mgi_image()`

**Trigger:** Fires on device_images INSERT or UPDATE of status column

**Logic:**
```sql
IF NEW.status = 'complete' AND OLD.status != 'complete' THEN
  IF NEW.observation_id IS NOT NULL THEN
    -- Call score_mgi_image edge function via pg_net
  END IF
END IF
```

**Requirements:**
- Requires `pg_net` extension enabled
- Requires database configuration:
  ```sql
  ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT.supabase.co';
  ALTER DATABASE postgres SET app.supabase_service_role_key = 'YOUR_SERVICE_KEY';
  ```

**Fallback:** If pg_net not available, use scheduled job or manual trigger

---

### **4. Velocity & Speed Calculations**

#### **Function: fn_calculate_mgi_velocity**

**Purpose:** Calculate MGI change over time for a device

**Parameters:**
- `p_device_id` (uuid) - Device to analyze
- `p_window_days` (integer, default 5) - Time window

**Returns:**
- `observation_id` - Observation UUID
- `captured_at` - When observation was captured
- `mgi_score` - Current MGI score
- `previous_mgi_score` - Previous score for same slot
- `days_elapsed` - Days between observations
- `velocity` - Net change in MGI (current - previous)
- `speed_per_day` - Average change per day (velocity / days_elapsed)

**Usage:**
```sql
-- Get velocity for specific device
SELECT * FROM fn_calculate_mgi_velocity('device-uuid-here', 7);

-- Get latest high-velocity observations
SELECT * FROM fn_calculate_mgi_velocity('device-uuid-here', 5)
WHERE velocity > 0.1
ORDER BY captured_at DESC
LIMIT 10;
```

**Key Insights:**
- **Velocity** = Absolute change (e.g., 0.15 = grew from 0.40 to 0.55)
- **Speed** = Rate of change (e.g., 0.03/day = 3% daily increase)
- Partitioned by `slot_index` to track individual petri dishes
- Returns NULL for first observation (no previous to compare)

#### **Function: fn_get_zone_mgi_averages**

**Purpose:** Get MGI statistics by zone for a site

**Parameters:**
- `p_site_id` (uuid) - Site to analyze
- `p_window_days` (integer, default 7) - Time window

**Returns:**
- `zone_id` - Zone UUID
- `zone_label` - Zone name
- `device_count` - Devices in zone
- `avg_mgi_score` - Average MGI across zone
- `max_mgi_score` - Highest MGI in zone
- `min_mgi_score` - Lowest MGI in zone
- `latest_reading_at` - Most recent reading

**Usage:**
```sql
-- Get zone averages for site
SELECT * FROM fn_get_zone_mgi_averages('site-uuid-here', 7);

-- Find high-risk zones
SELECT * FROM fn_get_zone_mgi_averages('site-uuid-here', 7)
WHERE avg_mgi_score > 0.60
ORDER BY avg_mgi_score DESC;
```

---

### **5. Monitoring View**

**View:** `vw_mgi_trends`

**Purpose:** Comprehensive MGI data with device/zone context

**Columns:**
- Device info (device_id, device_name, device_mac)
- Site info (site_id, site_name)
- Zone info (zone_id, zone_label)
- Placement (placement_x, placement_y from placement_json)
- Observation data (observation_id, slot_index, captured_at)
- MGI scores (mgi_score, mgi_confidence, mgi_scored_at)
- Hierarchy (submission_id, program_id, company_id)

**Usage:**
```sql
-- Recent MGI scores across all devices
SELECT * FROM vw_mgi_trends
ORDER BY captured_at DESC
LIMIT 50;

-- High MGI scores in specific zone
SELECT * FROM vw_mgi_trends
WHERE zone_label = 'North Corner'
AND mgi_score > 0.70
ORDER BY captured_at DESC;

-- MGI trends for specific site
SELECT
  device_name,
  DATE(captured_at) AS date,
  AVG(mgi_score) AS avg_daily_mgi
FROM vw_mgi_trends
WHERE site_id = 'site-uuid-here'
GROUP BY device_name, DATE(captured_at)
ORDER BY date DESC;
```

---

## **Deployment Steps**

### **Step 1: Deploy Edge Function**

```bash
cd /tmp/cc-agent/51386994/project
supabase functions deploy score_mgi_image
```

**Verify:**
```bash
# Test health (should return 405 Method Not Allowed for GET)
curl https://YOUR_PROJECT.supabase.co/functions/v1/score_mgi_image
```

---

### **Step 2: Apply Migration**

```bash
supabase db push --file supabase/migrations/20251113000002_mgi_scoring_and_velocity.sql
```

**Verify:**
```sql
-- Check columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'petri_observations'
AND column_name IN ('mgi_score', 'mgi_confidence', 'mgi_scored_at');

-- Check functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_name LIKE 'fn_%mgi%';

-- Check trigger exists
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trigger_auto_score_mgi_image';
```

---

### **Step 3: Configure Database Settings**

**Required for trigger to call edge functions:**

```sql
-- Set Supabase URL
ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT.supabase.co';

-- Set service role key (get from Supabase dashboard)
ALTER DATABASE postgres SET app.supabase_service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

**Verify:**
```sql
SHOW app.supabase_url;
-- Should return your project URL
```

---

### **Step 4: Enable pg_net Extension**

**If not already enabled:**

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
```

**Verify:**
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_net';
```

---

### **Step 5: Test Integration**

**Option A: Manual Test via Script**

```bash
# Get an existing device image with URL
# Replace with actual image_id and URL from your database
node test/test_mgi_scoring.mjs \
  "123e4567-e89b-12d3-a456-426614174000" \
  "https://your-bucket.supabase.co/storage/v1/object/public/device-images/image.jpg"
```

**Option B: Trigger via Device Submission**

1. Complete a device submission with petri dish images
2. Wait for image to reach `status = 'complete'`
3. Check `petri_observations` for populated `mgi_score`

**Option C: Manual SQL Trigger**

```sql
-- Get a completed image without MGI score
SELECT image_id, image_url, observation_id
FROM device_images
WHERE status = 'complete'
AND observation_id IS NOT NULL
AND observation_id NOT IN (
  SELECT observation_id FROM petri_observations WHERE mgi_score IS NOT NULL
)
LIMIT 1;

-- Manually trigger scoring
SELECT net.http_post(
  url := 'https://YOUR_PROJECT.supabase.co/functions/v1/score_mgi_image',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
  ),
  body := jsonb_build_object(
    'image_id', 'IMAGE_ID_HERE',
    'image_url', 'IMAGE_URL_HERE'
  )
);
```

---

## **Verification Checklist**

- [ ] Edge function deployed successfully
- [ ] Migration applied without errors
- [ ] `mgi_score`, `mgi_confidence`, `mgi_scored_at` columns exist
- [ ] `fn_calculate_mgi_velocity` function callable
- [ ] `fn_get_zone_mgi_averages` function callable
- [ ] `vw_mgi_trends` view returns data
- [ ] Trigger `trigger_auto_score_mgi_image` exists
- [ ] Database settings configured (app.supabase_url, app.supabase_service_role_key)
- [ ] pg_net extension enabled
- [ ] Test script successfully scores image
- [ ] Auto-scoring triggers on image completion
- [ ] Velocity calculations return expected results

---

## **Monitoring & Troubleshooting**

### **Check Recent MGI Scores**

```sql
SELECT
  device_name,
  captured_at,
  mgi_score,
  mgi_confidence,
  mgi_scored_at
FROM vw_mgi_trends
ORDER BY mgi_scored_at DESC
LIMIT 20;
```

### **Check for Scoring Errors**

```sql
SELECT *
FROM async_error_logs
WHERE function_name IN ('roboflow_score', 'trg_auto_score_mgi_image')
ORDER BY created_at DESC
LIMIT 10;
```

### **Check Images Pending Scoring**

```sql
SELECT
  di.image_id,
  di.image_url,
  di.status,
  di.created_at,
  po.observation_id,
  po.mgi_score
FROM device_images di
INNER JOIN petri_observations po ON po.observation_id = di.observation_id
WHERE di.status = 'complete'
AND po.mgi_score IS NULL
ORDER BY di.created_at DESC
LIMIT 10;
```

### **Manually Score Pending Images**

```sql
-- Get pending images
WITH pending AS (
  SELECT
    di.image_id,
    di.image_url
  FROM device_images di
  INNER JOIN petri_observations po ON po.observation_id = di.observation_id
  WHERE di.status = 'complete'
  AND po.mgi_score IS NULL
  LIMIT 10
)
SELECT net.http_post(
  url := 'https://YOUR_PROJECT.supabase.co/functions/v1/score_mgi_image',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
  ),
  body := jsonb_build_object(
    'image_id', image_id,
    'image_url', image_url
  )
) FROM pending;
```

---

## **Common Issues**

### **Issue: Trigger Not Firing**

**Symptoms:** Images complete but mgi_score remains NULL

**Checks:**
1. Verify pg_net extension enabled: `SELECT * FROM pg_extension WHERE extname = 'pg_net';`
2. Check database settings: `SHOW app.supabase_url;`
3. Check trigger exists: `SELECT * FROM information_schema.triggers WHERE trigger_name = 'trigger_auto_score_mgi_image';`
4. Check async_error_logs for trigger errors

**Solution:**
- Enable pg_net if missing
- Set database configuration values
- Manually trigger scoring for pending images

---

### **Issue: Roboflow API Returns No Score**

**Symptoms:** Edge function succeeds but mgi_score is NULL

**Checks:**
1. Check edge function logs in Supabase dashboard
2. Verify image URL is publicly accessible
3. Check Roboflow API response structure

**Solution:**
- Update edge function parsing logic if response structure differs
- Verify Roboflow workflow is deployed and active
- Check image format is supported (JPEG/PNG)

---

### **Issue: Velocity Calculations Return Empty**

**Symptoms:** `fn_calculate_mgi_velocity` returns no rows

**Checks:**
1. Verify device has multiple scored observations: `SELECT COUNT(*) FROM vw_mgi_trends WHERE device_id = 'uuid';`
2. Check time window: observations must be within `p_window_days`
3. Verify slot_index matching (partitioned by slot)

**Solution:**
- Increase window_days parameter
- Ensure multiple observations exist for same device
- Check that observations have same slot_index

---

## **Performance Considerations**

- Edge function call is asynchronous (doesn't block image completion)
- Roboflow API typically responds in 1-3 seconds
- Velocity calculations use windowed queries (efficient with indexes)
- vw_mgi_trends is a view (real-time, no caching)
- Consider materialized view for large datasets

---

## **Future Enhancements**

### **Phase 2+ Potential Features:**

1. **Batch Scoring**
   - Score multiple pending images in single API call
   - Reduce API costs and latency

2. **Threshold Alerts**
   - Trigger alerts when MGI exceeds thresholds
   - Integrate with company_alert_prefs

3. **Trend Predictions**
   - Use velocity/speed to predict future MGI
   - Alert before reaching critical levels

4. **Zone Heat Maps**
   - Visual representation of MGI by zone
   - Real-time updates via websockets

5. **Automated Reporting**
   - Daily/weekly MGI summaries
   - Velocity trends by device/zone/site

---

## **API Reference**

### **Edge Function: score_mgi_image**

**Endpoint:** `POST /functions/v1/score_mgi_image`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY
```

**Request Body:**
```json
{
  "image_id": "uuid",
  "image_url": "https://..."
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "MGI score saved successfully",
  "image_id": "uuid",
  "observation_id": "uuid",
  "mgi_score": 0.75,
  "confidence": 0.92
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message"
}
```

---

## **Cost Estimation**

**Roboflow API:**
- Pay-per-inference model
- Estimate: $0.001 - $0.01 per image (depends on plan)
- For 1000 images/month: ~$1-10/month

**Supabase:**
- Edge function invocations: Included in plan
- Database storage: Minimal (3 columns per observation)
- pg_net requests: Included in plan

**Total:** Very cost-effective for MVP and production

---

**End of Roboflow Integration Documentation**

For support, refer to:
- Edge Function: `supabase/functions/score_mgi_image/index.ts`
- Migration: `supabase/migrations/20251113000002_mgi_scoring_and_velocity.sql`
- Test Script: `test/test_mgi_scoring.mjs`
