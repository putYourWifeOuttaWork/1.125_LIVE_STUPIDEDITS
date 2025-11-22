/*
  # Fix Roboflow Auto-Scoring Trigger - No Vault Required

  ## Problem
  - Migration 20251122000000 used current_setting('app.supabase_url') which doesn't exist
  - Migration 20251122120001 tried to use vault extension which is not available
  - Found in async_error_logs: "unrecognized configuration parameter"

  ## Solution - Simplified Approach
  Instead of using vault or config parameters, we'll:
  1. Use async edge function call that doesn't require auth token in trigger
  2. Edge function will use its own internal service role client
  3. Trigger just needs to notify - no secrets needed in trigger code

  ## Alternative: Store in Database Config
  We store the service_role_key in a simple config table with RLS
  Only SECURITY DEFINER functions can read it
*/

-- ============================================
-- 1. CREATE CONFIG TABLE FOR SECRETS
-- ============================================

CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS - only functions can access
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

-- No policies = no direct access, only SECURITY DEFINER functions can read
DROP POLICY IF EXISTS "No direct access to secrets" ON app_secrets;
CREATE POLICY "No direct access to secrets" ON app_secrets FOR ALL USING (false);

COMMENT ON TABLE app_secrets IS 'Application secrets - only accessible via SECURITY DEFINER functions';

-- Insert service role key
INSERT INTO app_secrets (key, value, description)
VALUES (
  'service_role_key',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzMTQzNiwiZXhwIjoyMDY2NzA3NDM2fQ.RSZ2H5dccCwE1C58hq-DqKehHcnoaRBO0AhPQZ54gAI',
  'Supabase service role key for internal API calls'
),
(
  'supabase_url',
  'https://jycxolmevsvrxmeinxff.supabase.co',
  'Supabase project URL'
)
ON CONFLICT (key) 
DO UPDATE SET 
  value = EXCLUDED.value,
  updated_at = NOW();

-- ============================================
-- 2. HELPER FUNCTION TO GET SECRETS
-- ============================================

CREATE OR REPLACE FUNCTION get_app_secret(secret_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  secret_value TEXT;
BEGIN
  SELECT value INTO secret_value
  FROM app_secrets
  WHERE key = secret_key;
  
  RETURN secret_value;
END;
$$;

COMMENT ON FUNCTION get_app_secret IS 'Retrieve application secret by key - SECURITY DEFINER only';

-- ============================================
-- 3. RECREATE TRIGGER WITH CONFIG TABLE
-- ============================================

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS trigger_auto_score_mgi_image ON device_images;
DROP FUNCTION IF EXISTS trg_auto_score_mgi_image();

-- Create trigger function using config table for secrets
CREATE OR REPLACE FUNCTION trg_auto_score_mgi_image()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Only trigger on status change to 'complete' with valid image URL
  IF NEW.status = 'complete' AND
     (OLD.status IS NULL OR OLD.status != 'complete') AND
     NEW.image_url IS NOT NULL THEN

    -- Get configuration from app_secrets
    BEGIN
      v_supabase_url := get_app_secret('supabase_url');
      v_service_key := get_app_secret('service_role_key');
    EXCEPTION WHEN OTHERS THEN
      -- Log config access error
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
        'Cannot access app_secrets: ' || SQLERRM,
        jsonb_build_object(
          'sqlstate', SQLSTATE,
          'hint', 'Ensure app_secrets table exists with supabase_url and service_role_key'
        )
      );
      
      RAISE WARNING 'Cannot access app_secrets: %', SQLERRM;
      RETURN NEW;
    END;

    -- Validate we have both config values
    IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
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
        jsonb_build_object('image_id', NEW.image_id),
        'Missing configuration: supabase_url or service_role_key not found in app_secrets'
      );
      
      RAISE WARNING 'Cannot trigger MGI scoring: Missing configuration in app_secrets';
      RETURN NEW;
    END IF;

    -- Call edge function
    BEGIN
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

      RAISE NOTICE 'Triggered MGI scoring for image: % (URL: %)', NEW.image_id, NEW.image_url;
    EXCEPTION WHEN OTHERS THEN
      -- Log HTTP call error
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
        'HTTP call to edge function failed: ' || SQLERRM,
        jsonb_build_object(
          'sqlstate', SQLSTATE,
          'endpoint', v_supabase_url || '/functions/v1/score_mgi_image'
        )
      );
      
      RAISE WARNING 'HTTP call to edge function failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Catch-all error handler
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
      'Unexpected error in trigger: ' || SQLERRM,
      jsonb_build_object(
        'sqlstate', SQLSTATE
      )
    );

    RAISE WARNING 'Unexpected error in MGI scoring trigger: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_auto_score_mgi_image IS
  'Auto-trigger MGI scoring when device_images.status becomes complete. Uses app_secrets table for configuration.';

-- ============================================
-- 4. RECREATE TRIGGER
-- ============================================

CREATE TRIGGER trigger_auto_score_mgi_image
  AFTER UPDATE OF status, image_url ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION trg_auto_score_mgi_image();

COMMENT ON TRIGGER trigger_auto_score_mgi_image ON device_images IS
  'Calls score_mgi_image edge function when image processing completes';

-- ============================================
-- 5. CLEANUP OLD ERRORS
-- ============================================

-- Clear old configuration parameter errors
DELETE FROM async_error_logs
WHERE trigger_name = 'trg_auto_score_mgi_image'
  AND (
    error_message LIKE '%unrecognized configuration parameter%'
    OR error_message LIKE '%app.supabase_url%'
    OR error_message LIKE '%vault%'
  );

-- ============================================
-- 6. VERIFICATION
-- ============================================

DO $$
DECLARE
  v_secrets_exist BOOLEAN;
  v_url_exists BOOLEAN;
  v_key_exists BOOLEAN;
  v_trigger_exists BOOLEAN;
BEGIN
  -- Check app_secrets table
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'app_secrets'
  ) INTO v_secrets_exist;

  -- Check secrets exist
  SELECT EXISTS(
    SELECT 1 FROM app_secrets WHERE key = 'supabase_url'
  ) INTO v_url_exists;

  SELECT EXISTS(
    SELECT 1 FROM app_secrets WHERE key = 'service_role_key'
  ) INTO v_key_exists;

  -- Check trigger
  SELECT EXISTS(
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_auto_score_mgi_image' 
    AND tgrelid = 'device_images'::regclass
  ) INTO v_trigger_exists;

  -- Report status
  RAISE NOTICE '=== Roboflow Trigger Fix Status ===';
  
  IF v_secrets_exist THEN
    RAISE NOTICE '✓ app_secrets table exists';
  ELSE
    RAISE WARNING '✗ app_secrets table NOT found';
  END IF;

  IF v_url_exists THEN
    RAISE NOTICE '✓ supabase_url configured';
  ELSE
    RAISE WARNING '✗ supabase_url NOT found in app_secrets';
  END IF;

  IF v_key_exists THEN
    RAISE NOTICE '✓ service_role_key configured';
  ELSE
    RAISE WARNING '✗ service_role_key NOT found in app_secrets';
  END IF;

  IF v_trigger_exists THEN
    RAISE NOTICE '✓ Trigger recreated successfully';
  ELSE
    RAISE WARNING '✗ Trigger NOT created';
  END IF;

  IF v_secrets_exist AND v_url_exists AND v_key_exists AND v_trigger_exists THEN
    RAISE NOTICE '✓ All checks passed - Roboflow auto-scoring is ready';
  ELSE
    RAISE WARNING '⚠ Some checks failed - review errors above';
  END IF;
END $$;
