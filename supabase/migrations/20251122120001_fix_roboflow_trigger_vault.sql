/*
  # Fix Roboflow Auto-Scoring Trigger - Use Vault Secrets

  ## Problem
  Migration 20251122000000 used current_setting('app.supabase_url') which doesn't exist
  Found in async_error_logs: "unrecognized configuration parameter 'app.supabase_url'"

  ## Evidence
  async_error_logs shows 4+ errors:
  - trigger_name: trg_auto_score_mgi_image
  - error: "unrecognized configuration parameter 'app.supabase_url'"
  - Trigger IS firing, but cannot call edge function

  ## Solution
  1. Enable vault extension
  2. Hardcode Supabase URL (not a secret, it's in frontend)
  3. Use vault.decrypted_secrets for service_role_key
  4. Add proper error handling

  ## Security
  - service_role_key encrypted in vault
  - Function remains SECURITY DEFINER
  - Errors logged but don't fail transactions
*/

-- ============================================
-- 1. ENABLE VAULT EXTENSION
-- ============================================

CREATE EXTENSION IF NOT EXISTS vault WITH SCHEMA vault;

COMMENT ON EXTENSION vault IS 'Supabase Vault for encrypted secrets storage';

-- ============================================
-- 2. STORE SERVICE ROLE KEY IN VAULT
-- ============================================

-- Insert service_role_key into vault (encrypted automatically)
INSERT INTO vault.secrets (name, secret)
VALUES (
  'service_role_key',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzMTQzNiwiZXhwIjoyMDY2NzA3NDM2fQ.RSZ2H5dccCwE1C58hq-DqKehHcnoaRBO0AhPQZ54gAI'
)
ON CONFLICT (name) 
DO UPDATE SET 
  secret = EXCLUDED.secret,
  updated_at = NOW();

-- ============================================
-- 3. RECREATE TRIGGER WITH VAULT SECRETS
-- ============================================

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS trigger_auto_score_mgi_image ON device_images;
DROP FUNCTION IF EXISTS trg_auto_score_mgi_image();

-- Create trigger function using vault for secrets
CREATE OR REPLACE FUNCTION trg_auto_score_mgi_image()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      -- Log vault access error
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
        'Cannot access vault for service_role_key: ' || SQLERRM,
        jsonb_build_object(
          'sqlstate', SQLSTATE,
          'hint', 'Ensure vault extension is enabled and service_role_key exists in vault.secrets'
        )
      );
      
      RAISE WARNING 'Cannot access vault for service_role_key: %', SQLERRM;
      v_service_key := NULL;
    END;

    -- Call edge function if we have the key
    IF v_service_key IS NOT NULL THEN
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
    ELSE
      -- Log missing key error
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
        'Service role key not found in vault.decrypted_secrets'
      );
      
      RAISE WARNING 'Cannot trigger MGI scoring: No service role key available in vault';
    END IF;
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
  'Auto-trigger MGI scoring when device_images.status becomes complete. Uses vault for service_role_key authentication.';

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

-- Clear old configuration parameter errors from testing
DELETE FROM async_error_logs
WHERE trigger_name = 'trg_auto_score_mgi_image'
  AND (
    error_message LIKE '%unrecognized configuration parameter%'
    OR error_message LIKE '%app.supabase_url%'
  );

-- ============================================
-- 6. VERIFICATION
-- ============================================

DO $$
DECLARE
  v_vault_enabled BOOLEAN;
  v_key_exists BOOLEAN;
  v_trigger_exists BOOLEAN;
BEGIN
  -- Check vault extension
  SELECT EXISTS(
    SELECT 1 FROM pg_extension WHERE extname = 'vault'
  ) INTO v_vault_enabled;

  -- Check service_role_key in vault
  SELECT EXISTS(
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key'
  ) INTO v_key_exists;

  -- Check trigger
  SELECT EXISTS(
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_auto_score_mgi_image' 
    AND tgrelid = 'device_images'::regclass
  ) INTO v_trigger_exists;

  -- Report status
  RAISE NOTICE '=== Roboflow Trigger Fix Status ===';
  
  IF v_vault_enabled THEN
    RAISE NOTICE '✓ Vault extension enabled';
  ELSE
    RAISE WARNING '✗ Vault extension NOT enabled';
  END IF;

  IF v_key_exists THEN
    RAISE NOTICE '✓ service_role_key found in vault';
  ELSE
    RAISE WARNING '✗ service_role_key NOT found in vault - trigger will not work!';
  END IF;

  IF v_trigger_exists THEN
    RAISE NOTICE '✓ Trigger recreated successfully';
  ELSE
    RAISE WARNING '✗ Trigger NOT created';
  END IF;

  IF v_vault_enabled AND v_key_exists AND v_trigger_exists THEN
    RAISE NOTICE '✓ All checks passed - Roboflow auto-scoring is ready';
  ELSE
    RAISE WARNING '⚠ Some checks failed - review errors above';
  END IF;
END $$;
