# ROBOFLOW TRIGGER FIX - APPLY NOW

## Root Cause Found

The trigger **IS firing** but failing with:
```
error_message: "unrecognized configuration parameter 'app.supabase_url'"
sqlstate: 42704
```

The trigger was trying to use `current_setting('app.supabase_url')` which doesn't exist in Supabase.

## Evidence from async_error_logs

```
log_id: 124
created_at: 2025-11-22T18:49:48
trigger_name: trg_auto_score_mgi_image
error_message: unrecognized configuration parameter "app.supabase_url"
payload: {
  image_id: fa590cdd-5054-4ad5-910e-c928f9c70b07,
  image_url: https://immunolytics.com/wp-content/uploads/2019/10/Image-petri-dish.jpg
}
```

The trigger fired 4 times successfully detecting the conditions, but failed each time trying to call the edge function.

---

## Solution

Replace the trigger function to:
1. Hardcode the Supabase URL (it's not a secret, it's in your frontend code)
2. Get service_role_key from Supabase vault
3. Handle errors gracefully

---

## Step 1: Apply This SQL

Copy and paste this into Supabase Dashboard → SQL Editor:

```sql
/*
  # Fix Roboflow Trigger - Correct Configuration Access

  Fixes: "unrecognized configuration parameter 'app.supabase_url'"

  Changes:
  - Hardcode Supabase project URL
  - Use vault.decrypted_secrets for service_role_key
  - Add better error handling
*/

CREATE OR REPLACE FUNCTION trg_auto_score_mgi_image()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url TEXT := 'https://jycxolmevsvrxmeinxff.supabase.co';
  v_service_key TEXT;
BEGIN
  -- Only trigger on status change to 'complete' with valid image URL
  IF NEW.status = 'complete' AND
     (OLD.status IS NULL OR OLD.status != 'complete') AND
     NEW.image_url IS NOT NULL THEN

    -- Get service role key from vault
    BEGIN
      SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets
      WHERE name = 'service_role_key'
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Cannot access vault for service_role_key: %', SQLERRM;
      v_service_key := NULL;
    END;

    -- Call edge function if we have the key
    IF v_service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/score_mgi_image',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'image_id', NEW.image_id,
          'image_url', NEW.image_url
        )
      );

      RAISE NOTICE 'Triggered MGI scoring for image: %', NEW.image_id;
    ELSE
      RAISE WARNING 'Cannot trigger MGI scoring: No service role key available';

      -- Log to async_error_logs
      INSERT INTO async_error_logs (
        table_name,
        trigger_name,
        function_name,
        payload,
        error_message
      ) VALUES (
        TG_TABLE_NAME,
        TG_NAME,
        'trg_auto_score_mgi_image',
        jsonb_build_object(
          'image_id', NEW.image_id,
          'image_url', NEW.image_url
        ),
        'Service role key not found in vault'
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    INSERT INTO async_error_logs (
      table_name,
      trigger_name,
      function_name,
      payload,
      error_message,
      error_details
    ) VALUES (
      TG_TABLE_NAME,
      TG_NAME,
      'trg_auto_score_mgi_image',
      jsonb_build_object(
        'image_id', NEW.image_id,
        'image_url', NEW.image_url
      ),
      SQLERRM,
      jsonb_build_object(
        'sqlstate', SQLSTATE
      )
    );

    RAISE WARNING 'Error in MGI scoring trigger: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_auto_score_mgi_image IS
  'Auto-trigger MGI scoring using Supabase vault for service_role_key';
```

---

## Step 2: Setup Service Role Key in Vault

The trigger needs access to your service_role_key. Add it to Supabase Vault:

1. Go to Supabase Dashboard → Project Settings → API
2. Copy your `service_role` key (the secret one)
3. Go to Database → Extensions → Enable `vault` extension if not enabled
4. Run this SQL:

```sql
-- Insert service_role_key into vault
INSERT INTO vault.secrets (name, secret)
VALUES (
  'service_role_key',
  'YOUR_SERVICE_ROLE_KEY_HERE'  -- Paste your actual service_role key
)
ON CONFLICT (name)
DO UPDATE SET secret = EXCLUDED.secret;
```

---

## Step 3: Test the Fixed Trigger

```sql
-- Clear old error logs
DELETE FROM async_error_logs
WHERE trigger_name = 'trg_auto_score_mgi_image';

-- Reset test record
UPDATE device_images
SET
  image_url = 'https://immunolytics.com/wp-content/uploads/2019/10/Image-petri-dish.jpg',
  status = 'receiving',
  mgi_scoring_status = 'pending',
  mgi_score = NULL,
  mgi_velocity = NULL
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';

-- Trigger it
UPDATE device_images
SET status = 'complete'
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';

-- Wait 10 seconds, then check results
SELECT
  image_id,
  status,
  mgi_scoring_status,
  mgi_score,
  mgi_velocity,
  mgi_speed
FROM device_images
WHERE image_id = 'fa590cdd-5054-4ad5-910e-c928f9c70b07';

-- Check for errors
SELECT *
FROM async_error_logs
WHERE trigger_name = 'trg_auto_score_mgi_image'
ORDER BY created_at DESC
LIMIT 3;
```

---

## Expected Results

### Success Case
```
mgi_scoring_status: 'complete'
mgi_score: 0.05 (or similar)
mgi_velocity: (calculated)
mgi_speed: (calculated)
```

### If Still Failing

Check `async_error_logs` for the specific error. Common issues:

1. **"Cannot access vault"** → Run Step 2 to add service_role_key to vault
2. **"Service role key not found"** → Check vault.secrets table has 'service_role_key'
3. **"Function not found"** → Check edge function is deployed
4. **"Invalid MGI score"** → Roboflow API issue, check edge function logs

---

## Why This Happened

The original migration used:
```sql
url := current_setting('app.supabase_url') || '/functions/v1/score_mgi_image'
```

But `app.supabase_url` is not a valid Postgres configuration parameter in Supabase. The correct approaches are:

1. ✅ Hardcode the URL (it's public anyway)
2. ✅ Use `vault.decrypted_secrets` for secrets
3. ❌ NOT `current_setting()` for custom parameters

---

## Summary

- **Problem:** Trigger using non-existent config parameter
- **Evidence:** 4 errors in async_error_logs
- **Solution:** Hardcode URL + use vault for keys
- **Test:** Apply SQL, add vault secret, trigger test

The trigger was working correctly (detecting conditions), just couldn't make the HTTP call due to config issue!
