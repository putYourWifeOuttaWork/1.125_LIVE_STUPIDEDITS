/*
  # Auto-Calculate MGI Velocity on Score Update
  
  1. Changes
    - Add trigger to auto-calculate growth_velocity when mgi_score is updated
    - Velocity = difference from same device 1 day prior
    - Speed per day = velocity / days elapsed
  
  2. Logic
    - When mgi_score is set, find previous observation from same device
    - Calculate velocity as (current_mgi - previous_mgi)
    - Store in growth_velocity column
    - If no previous data within 7 days, velocity = NULL
*/

-- ============================================
-- TRIGGER FUNCTION: Auto-calculate MGI velocity
-- ============================================

CREATE OR REPLACE FUNCTION public.trg_auto_calculate_mgi_velocity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id UUID;
  v_current_time TIMESTAMPTZ;
  v_previous_observation RECORD;
  v_days_elapsed NUMERIC;
  v_velocity NUMERIC;
BEGIN
  /*
    Auto-calculate growth_velocity when mgi_score is updated
    
    Velocity = (current_mgi - previous_mgi) per day
    Uses same device, same order_index, within 7-day window
  */
  
  -- Only calculate if mgi_score was just set
  IF NEW.mgi_score IS NOT NULL AND (OLD.mgi_score IS NULL OR OLD.mgi_score != NEW.mgi_score) THEN
    
    -- Get device_id from the observation
    -- Device-generated observations have device_id directly
    IF NEW.device_id IS NOT NULL THEN
      v_device_id := NEW.device_id;
    ELSE
      -- Manual submissions - get device from submission
      SELECT created_by_device_id INTO v_device_id
      FROM submissions
      WHERE submission_id = NEW.submission_id;
    END IF;
    
    IF v_device_id IS NULL THEN
      -- No device associated, can't calculate velocity
      RETURN NEW;
    END IF;
    
    -- Get timestamp of current observation
    IF NEW.is_device_generated THEN
      v_current_time := NEW.created_at;
    ELSE
      SELECT created_at INTO v_current_time
      FROM submissions
      WHERE submission_id = NEW.submission_id;
    END IF;
    
    -- Find previous observation from same device with MGI score
    -- Within 7-day window, same order_index
    SELECT 
      po.mgi_score,
      CASE 
        WHEN po.is_device_generated THEN po.created_at
        ELSE s.created_at
      END as captured_at
    INTO v_previous_observation
    FROM petri_observations po
    LEFT JOIN submissions s ON s.submission_id = po.submission_id
    WHERE (
      (po.device_id = v_device_id) OR 
      (s.created_by_device_id = v_device_id)
    )
      AND po.mgi_score IS NOT NULL
      AND po.observation_id != NEW.observation_id
      AND po.order_index = NEW.order_index
      AND (
        CASE 
          WHEN po.is_device_generated THEN po.created_at
          ELSE s.created_at
        END
      ) < v_current_time
      AND (
        CASE 
          WHEN po.is_device_generated THEN po.created_at
          ELSE s.created_at
        END
      ) >= (v_current_time - INTERVAL '7 days')
    ORDER BY (
      CASE 
        WHEN po.is_device_generated THEN po.created_at
        ELSE s.created_at
      END
    ) DESC
    LIMIT 1;
    
    IF v_previous_observation.mgi_score IS NOT NULL THEN
      -- Calculate days elapsed
      v_days_elapsed := EXTRACT(EPOCH FROM (v_current_time - v_previous_observation.captured_at)) / 86400.0;
      
      IF v_days_elapsed > 0 THEN
        -- Calculate velocity as change per day
        v_velocity := (NEW.mgi_score - v_previous_observation.mgi_score) / v_days_elapsed;
        
        -- Store velocity (clamped to reasonable range)
        NEW.growth_velocity := GREATEST(-1.0, LEAST(1.0, v_velocity));
        
        RAISE NOTICE 'MGI Velocity calculated: % (%.2f days elapsed, %.4f -> %.4f)', 
          NEW.growth_velocity, v_days_elapsed, v_previous_observation.mgi_score, NEW.mgi_score;
      END IF;
    ELSE
      -- No previous observation found
      NEW.growth_velocity := NULL;
      RAISE NOTICE 'No previous MGI observation found for velocity calculation';
    END IF;
    
  END IF;
  
  RETURN NEW;
  
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the transaction
  INSERT INTO async_error_logs (
    table_name,
    trigger_name,
    function_name,
    payload,
    error_message,
    error_details
  ) VALUES (
    'petri_observations',
    'trg_auto_calculate_mgi_velocity',
    'trg_auto_calculate_mgi_velocity',
    jsonb_build_object(
      'observation_id', NEW.observation_id,
      'mgi_score', NEW.mgi_score
    ),
    SQLERRM,
    jsonb_build_object('sqlstate', SQLSTATE)
  );
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_auto_calculate_mgi_velocity IS 
  'Auto-calculate growth_velocity when mgi_score is updated. Compares with previous observation from same device within 7 days.';

-- ============================================
-- CREATE TRIGGER
-- ============================================

DROP TRIGGER IF EXISTS trigger_auto_calculate_mgi_velocity ON public.petri_observations;

CREATE TRIGGER trigger_auto_calculate_mgi_velocity
  BEFORE INSERT OR UPDATE OF mgi_score
  ON public.petri_observations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_calculate_mgi_velocity();

COMMENT ON TRIGGER trigger_auto_calculate_mgi_velocity ON public.petri_observations IS
  'Auto-calculate growth_velocity when MGI score is set or updated';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$ 
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'MGI Auto-Velocity Migration Complete';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - Created trg_auto_calculate_mgi_velocity function';
  RAISE NOTICE '  - Created trigger on petri_observations';
  RAISE NOTICE '';
  RAISE NOTICE 'Behavior:';
  RAISE NOTICE '  - When mgi_score is set, velocity is auto-calculated';
  RAISE NOTICE '  - Compares with previous observation from same device';
  RAISE NOTICE '  - Within 7-day window, same order_index';
  RAISE NOTICE '  - Velocity = (current - previous) / days_elapsed';
  RAISE NOTICE '============================================';
END $$;

-- ============================================
-- TRIGGER: Copy MGI score back to device_images
-- ============================================

CREATE OR REPLACE FUNCTION public.trg_sync_mgi_to_device_images()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  /*
    When petri_observation gets an MGI score, copy it back to device_images
    This allows device snapshots to access MGI data efficiently
  */
  
  IF NEW.mgi_score IS NOT NULL AND (OLD.mgi_score IS NULL OR OLD.mgi_score != NEW.mgi_score) THEN
    
    -- Find the linked device_image and update its mgi_score
    UPDATE device_images
    SET 
      mgi_score = NEW.mgi_score,
      mgi_confidence = NEW.mgi_confidence,
      mgi_scored_at = NEW.mgi_scored_at
    WHERE observation_id = NEW.observation_id
      AND observation_type = 'petri';
    
    IF FOUND THEN
      RAISE NOTICE 'Synced MGI score % to device_images for observation %', NEW.mgi_score, NEW.observation_id;
    END IF;
    
  END IF;
  
  RETURN NEW;
  
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail
  INSERT INTO async_error_logs (
    table_name,
    trigger_name,
    function_name,
    payload,
    error_message,
    error_details
  ) VALUES (
    'petri_observations',
    'trg_sync_mgi_to_device_images',
    'trg_sync_mgi_to_device_images',
    jsonb_build_object(
      'observation_id', NEW.observation_id,
      'mgi_score', NEW.mgi_score
    ),
    SQLERRM,
    jsonb_build_object('sqlstate', SQLSTATE)
  );
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_sync_mgi_to_device_images IS
  'Copy MGI score from petri_observations to device_images for snapshot efficiency';

-- Create trigger
DROP TRIGGER IF EXISTS trigger_sync_mgi_to_device_images ON public.petri_observations;

CREATE TRIGGER trigger_sync_mgi_to_device_images
  AFTER INSERT OR UPDATE OF mgi_score
  ON public.petri_observations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_mgi_to_device_images();

COMMENT ON TRIGGER trigger_sync_mgi_to_device_images ON public.petri_observations IS
  'Sync MGI score to device_images when scored';

-- ============================================
-- FINAL SUMMARY
-- ============================================

DO $$ 
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'MGI COMPLETE FLOW NOW ACTIVE';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Flow:';
  RAISE NOTICE '  1. Device sends image via MQTT';
  RAISE NOTICE '  2. Image assembled and uploaded to storage';
  RAISE NOTICE '  3. petri_observation created (linked to device_images)';
  RAISE NOTICE '  4. Trigger calls Roboflow edge function';
  RAISE NOTICE '  5. Roboflow returns MGI score (1-100)';
  RAISE NOTICE '  6. MGI score saved to petri_observations';
  RAISE NOTICE '  7. AUTO: growth_velocity calculated (vs 1 day prior)';
  RAISE NOTICE '  8. AUTO: MGI score copied to device_images';
  RAISE NOTICE '  9. Device snapshots can now query MGI + velocity';
  RAISE NOTICE '';
  RAISE NOTICE 'Columns updated automatically:';
  RAISE NOTICE '  - petri_observations.mgi_score (0.0-1.0)';
  RAISE NOTICE '  - petri_observations.growth_velocity (per day)';
  RAISE NOTICE '  - device_images.mgi_score (for snapshots)';
  RAISE NOTICE '============================================';
END $$;
