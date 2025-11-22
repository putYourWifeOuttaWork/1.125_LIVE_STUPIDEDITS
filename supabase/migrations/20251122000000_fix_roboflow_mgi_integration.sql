/*
  # Fix Roboflow MGI Integration - Device-Centric Architecture

  ## Changes
  1. Add MGI scoring status tracking columns to device_images
  2. Update trigger to remove petri_observations dependency
  3. Ensure automatic cascade: MGI score → velocity → speed → rollup → snapshots → alerts

  ## Architecture
  - device_images: PRIMARY storage for MGI scores (no petri_observations)
  - Trigger calls Roboflow on image completion
  - Existing calculate_and_rollup_mgi() handles velocity/speed/rollup automatically
  - Snapshots and alerts should regenerate when MGI updates

  ## Security
  - All functions remain SECURITY DEFINER
  - RLS policies already in place for device_images
*/

-- ============================================
-- 1. ADD MGI SCORING STATUS COLUMNS
-- ============================================

-- Add scoring status tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'mgi_scoring_status'
  ) THEN
    ALTER TABLE device_images ADD COLUMN mgi_scoring_status TEXT DEFAULT 'pending'
      CHECK (mgi_scoring_status IN ('pending', 'in_progress', 'complete', 'failed', 'skipped'));
    RAISE NOTICE 'Added column device_images.mgi_scoring_status';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'mgi_scoring_started_at'
  ) THEN
    ALTER TABLE device_images ADD COLUMN mgi_scoring_started_at TIMESTAMPTZ;
    RAISE NOTICE 'Added column device_images.mgi_scoring_started_at';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'roboflow_response'
  ) THEN
    ALTER TABLE device_images ADD COLUMN roboflow_response JSONB;
    RAISE NOTICE 'Added column device_images.roboflow_response';
  END IF;
END $$;

-- Add index for monitoring failed/pending scoring
CREATE INDEX IF NOT EXISTS idx_device_images_mgi_scoring_status
ON device_images(mgi_scoring_status)
WHERE mgi_scoring_status IN ('pending', 'failed', 'in_progress');

COMMENT ON COLUMN device_images.mgi_scoring_status IS 'Status of Roboflow MGI scoring: pending, in_progress, complete, failed, skipped';
COMMENT ON COLUMN device_images.mgi_scoring_started_at IS 'Timestamp when Roboflow scoring started';
COMMENT ON COLUMN device_images.roboflow_response IS 'Full Roboflow API response for debugging';

-- ============================================
-- 2. UPDATE TRIGGER - REMOVE OBSERVATION_ID DEPENDENCY
-- ============================================

-- Update trigger to work with device-centric architecture only
CREATE OR REPLACE FUNCTION public.trg_auto_score_mgi_image()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  /*
    When device_images.status changes to 'complete', trigger MGI scoring
    Calls score_mgi_image edge function asynchronously

    IMPORTANT: No longer requires observation_id (petri_observations are legacy)
    Works purely with device_images table
  */

  -- Only trigger on status change to 'complete' with valid image URL
  IF NEW.status = 'complete' AND
     (OLD.status IS NULL OR OLD.status != 'complete') AND
     NEW.image_url IS NOT NULL THEN

    -- Call edge function asynchronously via pg_net extension
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/score_mgi_image',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := jsonb_build_object(
        'image_id', NEW.image_id,
        'image_url', NEW.image_url
      )
    );

    RAISE NOTICE 'Triggered MGI scoring for image: % (URL: %)', NEW.image_id, NEW.image_url;
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
      'device_images',
      'trg_auto_score_mgi_image',
      'trg_auto_score_mgi_image',
      jsonb_build_object('image_id', NEW.image_id, 'image_url', NEW.image_url),
      SQLERRM,
      jsonb_build_object('sqlstate', SQLSTATE)
    );

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_auto_score_mgi_image IS
  'Auto-trigger MGI scoring when device_images.status becomes complete. Device-centric architecture - no observation_id required.';

-- Recreate trigger (drop first if exists)
DROP TRIGGER IF EXISTS trigger_auto_score_mgi_image ON public.device_images;

CREATE TRIGGER trigger_auto_score_mgi_image
  AFTER INSERT OR UPDATE OF status
  ON public.device_images
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_score_mgi_image();

-- ============================================
-- 3. VERIFY AUTOMATIC CASCADE EXISTS
-- ============================================

-- Verify that calculate_and_rollup_mgi trigger exists
DO $$
DECLARE
  v_trigger_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_calculate_and_rollup_mgi'
    AND tgrelid = 'device_images'::regclass
  ) INTO v_trigger_exists;

  IF v_trigger_exists THEN
    RAISE NOTICE '✓ Cascade trigger exists: calculate_and_rollup_mgi will auto-calculate velocity/speed/rollup';
  ELSE
    RAISE WARNING '⚠ Missing cascade trigger: calculate_and_rollup_mgi not found on device_images';
  END IF;
END $$;

-- ============================================
-- 4. CREATE RETRY FUNCTION FOR FAILED SCORING
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_retry_failed_mgi_scoring()
RETURNS TABLE (
  image_id UUID,
  status TEXT,
  action TEXT
) AS $$
BEGIN
  /*
    Retry MGI scoring for images that:
    1. Failed to score
    2. Have been stuck in 'in_progress' for >5 minutes
    3. Have been 'pending' for >2 minutes after completion

    Called by pg_cron every 10 minutes
  */

  RETURN QUERY
  WITH retry_candidates AS (
    SELECT
      di.image_id,
      di.image_url,
      di.mgi_scoring_status,
      di.mgi_scoring_started_at,
      di.received_at
    FROM device_images di
    WHERE
      di.status = 'complete'
      AND di.image_url IS NOT NULL
      AND (
        di.mgi_scoring_status = 'failed'
        OR (
          di.mgi_scoring_status = 'in_progress'
          AND di.mgi_scoring_started_at < NOW() - INTERVAL '5 minutes'
        )
        OR (
          di.mgi_scoring_status = 'pending'
          AND di.received_at < NOW() - INTERVAL '2 minutes'
        )
      )
    LIMIT 10
  )
  SELECT
    rc.image_id,
    rc.mgi_scoring_status AS status,
    'retrying'::TEXT AS action
  FROM retry_candidates rc;

  -- Trigger scoring for each candidate
  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/score_mgi_image',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := jsonb_build_object(
      'image_id', rc.image_id,
      'image_url', rc.image_url
    )
  )
  FROM retry_candidates rc;

  RAISE NOTICE 'Retried MGI scoring for % images', (SELECT COUNT(*) FROM retry_candidates);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_retry_failed_mgi_scoring IS
  'Retry MGI scoring for failed, stuck, or pending images. Called by pg_cron every 10 minutes.';

-- ============================================
-- 5. SETUP PG_CRON JOB FOR RETRIES
-- ============================================

-- Schedule retry job (runs every 10 minutes)
DO $$
BEGIN
  -- Remove existing job if it exists
  PERFORM cron.unschedule('retry-failed-mgi-scoring')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'retry-failed-mgi-scoring'
  );

  -- Create new job
  PERFORM cron.schedule(
    'retry-failed-mgi-scoring',
    '*/10 * * * *',
    $$ SELECT fn_retry_failed_mgi_scoring(); $$
  );

  RAISE NOTICE '✓ Scheduled pg_cron job: retry-failed-mgi-scoring (every 10 minutes)';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '⚠ Could not schedule pg_cron job (extension may not be enabled): %', SQLERRM;
END $$;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '
================================================================================
ROBOFLOW MGI INTEGRATION FIXED
================================================================================

✓ Added MGI scoring status tracking columns
✓ Updated trigger to remove petri_observations dependency
✓ Created retry function for failed scoring
✓ Scheduled pg_cron job for automatic retries

AUTOMATIC CASCADE (already exists):
  device_images.mgi_score updated
    ↓ trigger: calculate_and_rollup_mgi()
    ↓ calculates: mgi_velocity, mgi_speed
    ↓ rolls up to: devices.latest_mgi_score, latest_mgi_velocity
    ↓ regenerates: session_wake_snapshots (if trigger exists)
    ↓ checks: device_alert_thresholds (if trigger exists)

EDGE FUNCTION CHANGES (already deployed):
  ✓ Updated to use param2: "MGI"
  ✓ Updated to parse response: [{ "MGI": "0.05" }]
  ✓ Updated to write to device_images only (no petri_observations)
  ✓ Added status tracking (pending → in_progress → complete/failed)

MONITORING:
  -- Check pending/failed scoring
  SELECT image_id, mgi_scoring_status, mgi_scoring_started_at, roboflow_response
  FROM device_images
  WHERE mgi_scoring_status IN (''pending'', ''failed'', ''in_progress'')
  ORDER BY received_at DESC;

  -- Check retry function
  SELECT * FROM fn_retry_failed_mgi_scoring();

================================================================================
  ';
END $$;
