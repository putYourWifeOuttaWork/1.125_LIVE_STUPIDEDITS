/*
  # MGI Scoring + Velocity/Speed Calculations

  This migration adds:
  1. MGI score columns to petri_observations
  2. RPC functions for velocity and speed calculations
  3. Database trigger to auto-score images on completion
  4. Helper view for MGI trends

  IDEMPOTENT: Uses IF NOT EXISTS and ADD COLUMN IF NOT EXISTS
*/

-- ============================================
-- 1. PETRI_OBSERVATIONS: Add MGI score columns
-- ============================================

DO $$
BEGIN
  -- mgi_score: Normalized mold growth index (0.0 - 1.0)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'petri_observations'
    AND column_name = 'mgi_score'
  ) THEN
    ALTER TABLE public.petri_observations ADD COLUMN mgi_score numeric(5,4) NULL CHECK (mgi_score >= 0 AND mgi_score <= 1);
    RAISE NOTICE 'Added column petri_observations.mgi_score';
  END IF;

  -- mgi_confidence: Confidence score from AI model (0.0 - 1.0)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'petri_observations'
    AND column_name = 'mgi_confidence'
  ) THEN
    ALTER TABLE public.petri_observations ADD COLUMN mgi_confidence numeric(5,4) NULL CHECK (mgi_confidence >= 0 AND mgi_confidence <= 1);
    RAISE NOTICE 'Added column petri_observations.mgi_confidence';
  END IF;

  -- mgi_scored_at: Timestamp when AI scoring completed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'petri_observations'
    AND column_name = 'mgi_scored_at'
  ) THEN
    ALTER TABLE public.petri_observations ADD COLUMN mgi_scored_at timestamptz NULL;
    RAISE NOTICE 'Added column petri_observations.mgi_scored_at';
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_petri_observations_mgi_score ON public.petri_observations(mgi_score) WHERE mgi_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_petri_observations_mgi_scored_at ON public.petri_observations(mgi_scored_at DESC);

COMMENT ON COLUMN public.petri_observations.mgi_score IS 'AI-scored mold growth index (0.0-1.0) from Roboflow';
COMMENT ON COLUMN public.petri_observations.mgi_confidence IS 'Confidence score from AI model (0.0-1.0)';
COMMENT ON COLUMN public.petri_observations.mgi_scored_at IS 'Timestamp when AI scoring completed';

-- ============================================
-- 2. RPC FUNCTION: Calculate MGI velocity
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_calculate_mgi_velocity(
  p_device_id uuid,
  p_window_days integer DEFAULT 5
)
RETURNS TABLE (
  observation_id uuid,
  captured_at timestamptz,
  mgi_score numeric,
  previous_mgi_score numeric,
  days_elapsed numeric,
  velocity numeric,
  speed_per_day numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  /*
    Velocity: Net change in MGI between two observations
    Speed: Average change per day

    Returns observations with their previous observation for velocity calculation
  */

  RETURN QUERY
  WITH scored_observations AS (
    SELECT
      po.observation_id,
      po.submission_id,
      s.captured_at,
      po.mgi_score,
      po.mgi_scored_at,
      po.order_index
    FROM petri_observations po
    INNER JOIN submissions s ON s.submission_id = po.submission_id
    WHERE s.device_id = p_device_id
      AND po.mgi_score IS NOT NULL
      AND s.captured_at >= NOW() - (p_window_days || ' days')::INTERVAL
    ORDER BY s.captured_at ASC
  ),
  observations_with_previous AS (
    SELECT
      so.observation_id,
      so.captured_at,
      so.mgi_score,
      LAG(so.mgi_score) OVER (PARTITION BY so.order_index ORDER BY so.captured_at) AS previous_mgi_score,
      LAG(so.captured_at) OVER (PARTITION BY so.order_index ORDER BY so.captured_at) AS previous_captured_at,
      so.order_index
    FROM scored_observations so
  )
  SELECT
    owp.observation_id,
    owp.captured_at,
    owp.mgi_score,
    owp.previous_mgi_score,
    EXTRACT(EPOCH FROM (owp.captured_at - owp.previous_captured_at)) / 86400.0 AS days_elapsed,
    (owp.mgi_score - COALESCE(owp.previous_mgi_score, 0)) AS velocity,
    CASE
      WHEN owp.previous_captured_at IS NOT NULL THEN
        (owp.mgi_score - owp.previous_mgi_score) / NULLIF(EXTRACT(EPOCH FROM (owp.captured_at - owp.previous_captured_at)) / 86400.0, 0)
      ELSE NULL
    END AS speed_per_day
  FROM observations_with_previous owp
  WHERE owp.previous_mgi_score IS NOT NULL
  ORDER BY owp.captured_at DESC;
END;
$$;

COMMENT ON FUNCTION public.fn_calculate_mgi_velocity IS 'Calculate MGI velocity and speed per day for a device within a time window';

-- ============================================
-- 3. RPC FUNCTION: Get zone MGI averages
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_get_zone_mgi_averages(
  p_site_id uuid,
  p_window_days integer DEFAULT 7
)
RETURNS TABLE (
  zone_id uuid,
  zone_label text,
  device_count integer,
  avg_mgi_score numeric,
  max_mgi_score numeric,
  min_mgi_score numeric,
  latest_reading_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  /*
    Returns MGI statistics grouped by zone for a site
    Uses device placement and zone assignment
  */

  RETURN QUERY
  SELECT
    d.zone_id,
    d.zone_label,
    COUNT(DISTINCT d.device_id)::integer AS device_count,
    ROUND(AVG(po.mgi_score)::numeric, 4) AS avg_mgi_score,
    ROUND(MAX(po.mgi_score)::numeric, 4) AS max_mgi_score,
    ROUND(MIN(po.mgi_score)::numeric, 4) AS min_mgi_score,
    MAX(s.captured_at) AS latest_reading_at
  FROM devices d
  INNER JOIN submissions s ON s.created_by_device_id = d.device_id
  INNER JOIN petri_observations po ON po.submission_id = s.submission_id
  WHERE d.site_id = p_site_id
    AND d.zone_id IS NOT NULL
    AND po.mgi_score IS NOT NULL
    AND s.captured_at >= NOW() - (p_window_days || ' days')::INTERVAL
  GROUP BY d.zone_id, d.zone_label
  ORDER BY avg_mgi_score DESC;
END;
$$;

COMMENT ON FUNCTION public.fn_get_zone_mgi_averages IS 'Get MGI statistics grouped by zone for a site';

-- ============================================
-- 4. DATABASE TRIGGER: Auto-score completed images
-- ============================================

CREATE OR REPLACE FUNCTION public.trg_auto_score_mgi_image()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_image_url text;
BEGIN
  /*
    When device_images.status changes to 'complete', trigger MGI scoring
    Calls score_mgi_image edge function asynchronously
  */

  -- Only trigger on status change to 'complete'
  IF NEW.status = 'complete' AND (OLD.status IS NULL OR OLD.status != 'complete') THEN
    -- Check if observation exists (only score petri observations)
    IF NEW.observation_id IS NOT NULL THEN
      -- Get the image URL
      SELECT NEW.image_url INTO v_image_url;

      IF v_image_url IS NOT NULL THEN
        -- Call edge function asynchronously via pg_net extension
        -- NOTE: This requires pg_net extension to be enabled
        -- If not available, use a scheduled job or manual trigger

        PERFORM net.http_post(
          url := current_setting('app.supabase_url') || '/functions/v1/score_mgi_image',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
          ),
          body := jsonb_build_object(
            'image_id', NEW.image_id,
            'image_url', v_image_url
          )
        );

        RAISE NOTICE 'Triggered MGI scoring for image: %', NEW.image_id;
      END IF;
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
      'device_images',
      'trg_auto_score_mgi_image',
      'trg_auto_score_mgi_image',
      jsonb_build_object('image_id', NEW.image_id),
      SQLERRM,
      jsonb_build_object('sqlstate', SQLSTATE)
    );

    RETURN NEW;
END;
$$;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS trigger_auto_score_mgi_image ON public.device_images;

CREATE TRIGGER trigger_auto_score_mgi_image
  AFTER INSERT OR UPDATE OF status
  ON public.device_images
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_score_mgi_image();

COMMENT ON FUNCTION public.trg_auto_score_mgi_image IS 'Auto-trigger MGI scoring when device_images.status becomes complete';

-- ============================================
-- 5. VIEW: MGI trends for monitoring
-- ============================================

CREATE OR REPLACE VIEW public.vw_mgi_trends AS
SELECT
  d.device_id,
  d.device_name,
  d.device_mac,
  d.site_id,
  s.name AS site_name,
  d.zone_id,
  d.zone_label,
  d.placement_json,
  (d.placement_json->>'x')::numeric AS placement_x,
  (d.placement_json->>'y')::numeric AS placement_y,
  po.observation_id,
  po.order_index,
  sub.captured_at,
  po.mgi_score,
  po.mgi_confidence,
  po.mgi_scored_at,
  sub.submission_id,
  p.program_id,
  p.name AS program_name,
  p.company_id,
  c.name AS company_name
FROM petri_observations po
INNER JOIN submissions sub ON sub.submission_id = po.submission_id
LEFT JOIN devices d ON d.device_id = sub.created_by_device_id
LEFT JOIN sites s ON s.site_id = COALESCE(d.site_id, sub.site_id)
LEFT JOIN pilot_programs p ON p.program_id = COALESCE(d.program_id, sub.program_id)
LEFT JOIN companies c ON c.company_id = COALESCE(p.company_id, sub.company_id)
WHERE po.mgi_score IS NOT NULL
ORDER BY sub.captured_at DESC;

COMMENT ON VIEW public.vw_mgi_trends IS 'MGI scores with device context, zone placement, and timestamps for trend analysis';

-- ============================================
-- 6. CONFIGURATION: Set Supabase URL/Key for trigger
-- ============================================

-- These settings are used by the trigger to call edge functions
-- They should be set at the database level or session level

DO $$
BEGIN
  -- Note: In production, these should be set via ALTER DATABASE or environment
  -- For now, we'll document the requirement
  RAISE NOTICE 'IMPORTANT: Set app.supabase_url and app.supabase_service_role_key';
  RAISE NOTICE 'Run: ALTER DATABASE postgres SET app.supabase_url = ''https://YOUR_PROJECT.supabase.co'';';
  RAISE NOTICE 'Run: ALTER DATABASE postgres SET app.supabase_service_role_key = ''YOUR_SERVICE_ROLE_KEY'';';
END $$;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ MGI Scoring + Velocity migration completed successfully';
  RAISE NOTICE '   - Added mgi_score, mgi_confidence, mgi_scored_at to petri_observations';
  RAISE NOTICE '   - Created fn_calculate_mgi_velocity function';
  RAISE NOTICE '   - Created fn_get_zone_mgi_averages function';
  RAISE NOTICE '   - Created auto-scoring trigger on device_images';
  RAISE NOTICE '   - Created vw_mgi_trends view';
  RAISE NOTICE '   - IMPORTANT: Configure app.supabase_url and app.supabase_service_role_key';
END $$;
