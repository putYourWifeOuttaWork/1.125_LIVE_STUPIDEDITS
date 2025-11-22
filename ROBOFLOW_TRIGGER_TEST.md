# Roboflow Trigger Testing Guide

## Why Your Test Failed

**Your record:**
```
image_id: fa590cdd-5054-4ad5-910e-c928f9c70b07
status: 'complete'
image_url: NULL  ← PROBLEM!
```

**Trigger condition (line 84-86):**
```sql
IF NEW.status = 'complete' AND
   (OLD.status IS NULL OR OLD.status != 'complete') AND
   NEW.image_url IS NOT NULL THEN  ← FAILS HERE!
```

**Result:** Trigger doesn't fire because `image_url IS NULL`

This is correct! You can't score an image without a URL. Roboflow needs the URL to fetch and analyze the image.

---

## Correct Test Methods

### Option 1: Add URL to Existing Record

```sql
-- First, add URL and set status to receiving
UPDATE device_images
SET
  image_url = 'https://immunolytics.com/wp-content/uploads/2019/10/Image-petri-dish.jpg',
  status = 'receiving',
  mgi_scoring_status = 'pending'
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';

-- Now trigger by changing status to complete
UPDATE device_images
SET status = 'complete'
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';

-- Wait 5-10 seconds, then check
SELECT
  image_id,
  status,
  image_url,
  mgi_scoring_status,
  mgi_score,
  mgi_velocity
FROM device_images
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';
```

**Expected:**
- `mgi_scoring_status`: changes to `'complete'`
- `mgi_score`: 0.0 - 1.0
- `mgi_velocity`: calculated value

---

### Option 2: Single UPDATE with Both URL and Status

```sql
-- Set both at once (NEW trigger watches both columns!)
UPDATE device_images
SET
  image_url = 'https://immunolytics.com/wp-content/uploads/2019/10/Image-petri-dish.jpg',
  status = 'complete',
  mgi_scoring_status = 'pending',
  received_at = NOW()
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';

-- Wait 5-10 seconds, then check
SELECT
  image_id,
  mgi_scoring_status,
  mgi_score,
  roboflow_response
FROM device_images
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';
```

---

### Option 3: Fresh INSERT Test

```sql
-- Clean insert with all required fields
INSERT INTO device_images (
  image_id,
  device_id,
  site_id,
  program_id,
  site_device_session_id,
  image_name,
  image_url,  -- ✅ HAS URL
  captured_at,
  received_at,
  status,  -- ✅ COMPLETE
  chunk_count,
  expected_chunks,
  image_size_bytes,
  mgi_scoring_status,
  company_id
) VALUES (
  gen_random_uuid(),
  'f65baa44-a9ab-4d98-93d0-d39377fba011',  -- Your test device
  '4a21ccd9-56c5-48b2-90ca-c5fb756803d6',  -- site_id
  '6aa78f0f-6173-44e8-bc6c-877c775e2622',  -- program_id
  NULL,  -- session_id (optional for this test)
  'roboflow_test_' || extract(epoch from now())::text || '.jpg',
  'https://immunolytics.com/wp-content/uploads/2019/10/Image-petri-dish.jpg',
  NOW(),
  NOW(),
  'complete',  -- ✅ TRIGGERS ROBOFLOW
  1,
  1,
  123456,
  'pending',
  '743d51b9-17bf-43d5-ad22-deebafead6fa'
)
RETURNING image_id;

-- Save the returned image_id, wait 10 seconds, then:
SELECT
  image_id,
  image_name,
  status,
  mgi_scoring_status,
  mgi_score,
  mgi_velocity,
  mgi_speed,
  roboflow_response
FROM device_images
WHERE image_name LIKE 'roboflow_test_%'
ORDER BY created_at DESC
LIMIT 1;
```

---

## Trigger Flow Chart

```
┌─────────────────────────────────────┐
│  UPDATE device_images               │
│  SET status='complete'              │
│  WHERE image_id = '...'             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Trigger Fires                      │
│  (AFTER UPDATE OF status, image_url)│
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Check Conditions:                  │
│  1. NEW.status = 'complete'?        │
│  2. OLD.status != 'complete'?       │
│  3. NEW.image_url IS NOT NULL? ←────┼── CRITICAL!
└──────────────┬──────────────────────┘
               │
               ├─ YES (all true)
               │  └─→ Call Roboflow edge function
               │
               └─ NO (any false)
                  └─→ Skip (no action)
```

---

## Why image_url IS NOT NULL Check Exists

**Roboflow API requires:**
1. A publicly accessible image URL
2. The image must be fetchable via HTTP GET
3. Supported formats: JPG, PNG, etc.

**Without URL:**
- Can't fetch image
- Can't score it
- Trigger correctly skips

---

## Debugging Checklist

### If trigger doesn't fire:

1. **Check image_url**
   ```sql
   SELECT image_url FROM device_images WHERE image_id = '...';
   ```
   ❌ NULL → Won't fire
   ✅ 'https://...' → Should fire

2. **Check status**
   ```sql
   SELECT status FROM device_images WHERE image_id = '...';
   ```
   Must be 'complete'

3. **Check mgi_scoring_status**
   ```sql
   SELECT mgi_scoring_status FROM device_images WHERE image_id = '...';
   ```
   - 'pending' → Waiting for trigger
   - 'in_progress' → Roboflow called, processing
   - 'complete' → Done!
   - 'failed' → Check roboflow_response for error

4. **Check trigger exists**
   ```sql
   SELECT tgname, tgenabled
   FROM pg_trigger
   WHERE tgrelid = 'device_images'::regclass
     AND tgname = 'trigger_auto_score_mgi_image';
   ```
   Should return one row with tgenabled = 'O'

5. **Check edge function logs**
   - Go to Supabase Dashboard
   - Functions → score_mgi_image → Logs
   - Look for recent invocations

6. **Check for errors**
   ```sql
   SELECT *
   FROM async_error_logs
   WHERE table_name = 'device_images'
     AND trigger_name = 'trigger_auto_score_mgi_image'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

---

## Test Results Interpretation

### Success Case
```sql
SELECT image_id, mgi_scoring_status, mgi_score, mgi_velocity
FROM device_images
WHERE image_id = '...';
```

**Result:**
```
mgi_scoring_status: 'complete'
mgi_score: 0.05 (example - actual value from Roboflow)
mgi_velocity: 0.35 (calculated)
mgi_speed: 0.0083 (calculated)
```

### Pending Case
```
mgi_scoring_status: 'pending'
```
**Possible reasons:**
1. Trigger hasn't fired yet (check conditions above)
2. Edge function hasn't been called
3. Check if pg_net extension is enabled

### Failed Case
```
mgi_scoring_status: 'failed'
roboflow_response: {"error": "..."}
```
**Check roboflow_response for details:**
- Image URL not accessible (404)
- Invalid image format
- Roboflow API key incorrect
- Network timeout

---

## Quick Test Script (Copy/Paste Ready)

```sql
-- Test with your existing record
-- Step 1: Add URL and reset
UPDATE device_images
SET
  image_url = 'https://immunolytics.com/wp-content/uploads/2019/10/Image-petri-dish.jpg',
  status = 'receiving',
  mgi_scoring_status = 'pending',
  mgi_score = NULL,
  mgi_velocity = NULL,
  mgi_speed = NULL,
  roboflow_response = NULL
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';

-- Step 2: Trigger by changing status
UPDATE device_images
SET status = 'complete'
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';

-- Step 3: Wait 10 seconds (timer in terminal or watch)

-- Step 4: Check results
SELECT
  image_id,
  status,
  image_url,
  mgi_scoring_status,
  mgi_score,
  mgi_velocity,
  mgi_speed,
  roboflow_response,
  scored_at
FROM device_images
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';
```

---

## Expected Timeline

```
T+0s:  Execute UPDATE SET status='complete'
       → Trigger fires immediately
       → Calls edge function (async)
       → UPDATE returns immediately

T+1s:  Edge function starts
       → Fetches image from URL
       → Calls Roboflow API
       → Roboflow processes image

T+5s:  Roboflow returns MGI score
       → Edge function updates device_images
       → Sets mgi_scoring_status='complete'
       → Sets mgi_score, mgi_velocity, mgi_speed

T+10s: Check results (should be complete)
```

If still pending after 30 seconds, check:
1. Edge function logs
2. async_error_logs table
3. Network connectivity
4. Roboflow API key validity

---

## Summary

**Your test failed because:**
- Record had `image_url = NULL`
- Trigger requires `image_url IS NOT NULL`
- This is correct behavior!

**To test properly:**
1. Add a URL to the record first
2. Then change status to 'complete'
3. OR do both in one UPDATE
4. OR use fresh INSERT with both

**Use Option 1 script above for easiest test!**
