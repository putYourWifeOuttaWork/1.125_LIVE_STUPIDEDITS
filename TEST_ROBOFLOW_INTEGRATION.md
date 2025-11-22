# Test Roboflow MGI Integration

## Quick Answer: MQTT Won't Work for This Test

Your MQTT message with a URL in `image_name` **won't work** because:
- MQTT handler expects binary image chunks, not URLs
- `image_name` is just a filename identifier, not a URL field
- The system assembles chunks → uploads to S3 → then stores S3 URL in `image_url`

## Best Testing Method: Direct Database Insert

### Option 1: Simple Test (Manual Session ID)

If you already know a `device_id` and `session_id`, use this:

```sql
-- Replace YOUR_DEVICE_ID and YOUR_SESSION_ID with actual UUIDs
INSERT INTO device_images (
  image_id,
  device_id,
  session_id,
  wake_number,
  captured_at,
  received_at,
  status,
  image_url,
  chunk_count,
  expected_chunks,
  image_size_bytes,
  mgi_scoring_status
) VALUES (
  gen_random_uuid(),
  'YOUR_DEVICE_ID'::uuid,  -- Replace with real device_id
  'YOUR_SESSION_ID'::uuid,  -- Replace with real session_id
  1,
  NOW(),
  NOW(),
  'complete',  -- THIS TRIGGERS ROBOFLOW
  'https://immunolytics.com/wp-content/uploads/2019/10/Image-petri-dish.jpg',
  1,
  1,
  123456,
  'pending'
)
RETURNING image_id;
```

**Important:** Save the returned `image_id` to check results!

### Option 2: Automatic Test (Finds Device/Session)

```sql
DO $$
DECLARE
  v_device_id uuid;
  v_session_id uuid;
  v_image_id uuid;
BEGIN
  -- Find a physical device with a site
  SELECT device_id INTO v_device_id
  FROM devices
  WHERE device_type = 'physical'
    AND site_id IS NOT NULL
  LIMIT 1;

  IF v_device_id IS NULL THEN
    RAISE EXCEPTION 'No physical device found. Create a device first.';
  END IF;

  -- Find today's session
  SELECT session_id INTO v_session_id
  FROM device_sessions
  WHERE device_id = v_device_id
    AND DATE(wake_round_start) = CURRENT_DATE
    AND status IN ('active', 'in_progress')
  ORDER BY wake_round_start DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    -- Create a test session
    INSERT INTO device_sessions (
      session_id,
      device_id,
      session_date,
      wake_round_start,
      wake_round_end,
      status
    ) VALUES (
      gen_random_uuid(),
      v_device_id,
      CURRENT_DATE,
      NOW(),
      NOW() + INTERVAL '3 hours',
      'active'
    )
    RETURNING session_id INTO v_session_id;

    RAISE NOTICE 'Created new session: %', v_session_id;
  END IF;

  -- Insert test image
  v_image_id := gen_random_uuid();

  INSERT INTO device_images (
    image_id,
    device_id,
    session_id,
    wake_number,
    captured_at,
    received_at,
    status,
    image_url,
    chunk_count,
    expected_chunks,
    image_size_bytes,
    mgi_scoring_status
  ) VALUES (
    v_image_id,
    v_device_id,
    v_session_id,
    1,
    NOW(),
    NOW(),
    'complete',  -- TRIGGER FIRES HERE
    'https://immunolytics.com/wp-content/uploads/2019/10/Image-petri-dish.jpg',
    1,
    1,
    123456,
    'pending'
  );

  RAISE NOTICE '';
  RAISE NOTICE '✅ TEST IMAGE INSERTED';
  RAISE NOTICE '====================';
  RAISE NOTICE 'Image ID:   %', v_image_id;
  RAISE NOTICE 'Device ID:  %', v_device_id;
  RAISE NOTICE 'Session ID: %', v_session_id;
  RAISE NOTICE '';
  RAISE NOTICE 'Trigger should fire within seconds!';
  RAISE NOTICE '';
  RAISE NOTICE 'Check status:';
  RAISE NOTICE 'SELECT image_id, mgi_scoring_status, mgi_score, mgi_scored_at';
  RAISE NOTICE 'FROM device_images WHERE image_id = ''%'';', v_image_id;
END $$;
```

---

## Verify Results

### Step 1: Check Scoring Status (Wait 5-10 seconds)

```sql
-- Check the most recent test image
SELECT
  image_id,
  device_id,
  captured_at,
  mgi_scoring_status,
  mgi_score,
  mgi_velocity,
  mgi_speed,
  mgi_scored_at,
  roboflow_response
FROM device_images
WHERE image_url LIKE '%immunolytics.com%'
ORDER BY received_at DESC
LIMIT 5;
```

**Expected Results:**

**Immediately After Insert:**
```
mgi_scoring_status: 'pending' or 'in_progress'
mgi_score: NULL
```

**After 5-10 Seconds:**
```
mgi_scoring_status: 'complete'
mgi_score: 0.05 (or some value 0.0-1.0)
mgi_velocity: (calculated)
mgi_speed: (calculated)
mgi_scored_at: (timestamp)
roboflow_response: { "MGI": "0.05" }
```

### Step 2: Check Rollup to Devices Table

```sql
-- Verify the device's latest MGI was updated
SELECT
  d.device_id,
  d.device_name,
  d.latest_mgi_score,
  d.latest_mgi_velocity,
  d.latest_mgi_at
FROM devices d
JOIN device_images di ON di.device_id = d.device_id
WHERE di.image_url LIKE '%immunolytics.com%'
LIMIT 1;
```

**Expected:**
- `latest_mgi_score` should match the image's `mgi_score`
- `latest_mgi_velocity` should be calculated
- `latest_mgi_at` should match the image's `captured_at`

### Step 3: Check for Errors

```sql
-- Check if any errors were logged
SELECT *
FROM async_error_logs
WHERE trigger_name = 'trg_auto_score_mgi_image'
  OR function_name = 'roboflow_score'
ORDER BY created_at DESC
LIMIT 5;
```

Should be **empty** if everything worked!

---

## Troubleshooting

### Problem: mgi_scoring_status Stays 'pending'

**Check:**
1. Is the trigger installed?
   ```sql
   SELECT tgname FROM pg_trigger
   WHERE tgrelid = 'device_images'::regclass
   AND tgname = 'trigger_auto_score_mgi_image';
   ```

2. Are database settings configured?
   ```sql
   SELECT name, setting FROM pg_settings
   WHERE name IN ('app.supabase_url', 'app.supabase_service_role_key');
   ```

3. Check edge function logs in Supabase Dashboard

### Problem: mgi_scoring_status = 'failed'

**Check roboflow_response for error:**
```sql
SELECT
  image_id,
  mgi_scoring_status,
  roboflow_response
FROM device_images
WHERE mgi_scoring_status = 'failed'
ORDER BY received_at DESC
LIMIT 1;
```

**Common Issues:**
- Invalid image URL (404)
- Roboflow API key incorrect
- Image format not supported
- Network timeout

### Problem: Velocity/Speed Not Calculated

**Check if trigger exists:**
```sql
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'device_images'::regclass
AND tgname = 'trigger_calculate_and_rollup_mgi';
```

If missing, need to apply migration `20251121000001_device_image_automation.sql`

---

## Why Not MQTT?

The MQTT flow is:
```
Device → Sends binary chunks → MQTT service → Edge function
  → Assembles chunks → Uploads to S3 → Creates device_images with S3 URL
  → Trigger fires → Roboflow scores
```

Your message bypasses all chunk handling and tries to put a URL where a filename should be.

**For full MQTT testing**, you'd need:
1. A real ESP32-CAM device, OR
2. A simulator that sends proper base64 chunks

Direct database insert is much simpler for testing Roboflow integration!

---

## Clean Up Test Data

After testing:

```sql
-- Delete test images
DELETE FROM device_images
WHERE image_url LIKE '%immunolytics.com%';

-- Or keep them for reference
UPDATE device_images
SET notes = 'TEST IMAGE - Roboflow integration test'
WHERE image_url LIKE '%immunolytics.com%';
```

---

## Success Criteria

✅ Test passes if:
1. `mgi_scoring_status` changes to `'complete'` within 10 seconds
2. `mgi_score` is a number between 0.0 and 1.0
3. `mgi_velocity` and `mgi_speed` are calculated
4. `devices.latest_mgi_score` matches the image score
5. No errors in `async_error_logs`

Once this works, you know the Roboflow integration is functioning correctly!
