/*
  # Device Image Automation & Rollups
  
  1. Purpose
    - Auto-calculate mgi_velocity based on previous image
    - Auto-calculate mgi_speed based on program start date
    - Auto-rollup latest MGI data to devices table
    
  2. Changes
    - Create function to calculate velocity from previous image
    - Create function to rollup to devices table
    - Create triggers on device_images insert/update
*/

-- Function to calculate MGI velocity and rollup to device
CREATE OR REPLACE FUNCTION calculate_and_rollup_mgi()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_mgi numeric;
  v_prev_captured_at timestamptz;
  v_calculated_velocity numeric;
  v_program_start_date date;
  v_capture_date date;
  v_days_since_start numeric;
BEGIN
  -- Only process if mgi_score is set
  IF NEW.mgi_score IS NOT NULL THEN
    
    -- 1. Calculate mgi_velocity from previous image
    SELECT mgi_score, captured_at 
    INTO v_prev_mgi, v_prev_captured_at
    FROM device_images
    WHERE device_id = NEW.device_id
      AND captured_at < NEW.captured_at
      AND mgi_score IS NOT NULL
    ORDER BY captured_at DESC
    LIMIT 1;
    
    IF v_prev_mgi IS NOT NULL THEN
      -- Velocity is change in MGI
      v_calculated_velocity := NEW.mgi_score - v_prev_mgi;
      NEW.mgi_velocity := v_calculated_velocity;
    ELSE
      -- First image for this device
      NEW.mgi_velocity := 0;
    END IF;
    
    -- 2. Calculate mgi_speed (MGI per day from program start)
    SELECT pp.start_date INTO v_program_start_date
    FROM sites s
    JOIN pilot_programs pp ON pp.program_id = s.program_id
    WHERE s.site_id = NEW.site_id;
    
    IF v_program_start_date IS NOT NULL THEN
      v_capture_date := DATE(NEW.captured_at AT TIME ZONE 'UTC');
      v_days_since_start := v_capture_date - v_program_start_date;
      
      IF v_days_since_start > 0 THEN
        NEW.mgi_speed := NEW.mgi_score / v_days_since_start;
      ELSE
        NEW.mgi_speed := NEW.mgi_score;
      END IF;
    END IF;
    
    -- 3. Rollup to devices table (latest MGI)
    UPDATE devices
    SET 
      latest_mgi_score = NEW.mgi_score,
      latest_mgi_velocity = NEW.mgi_velocity,
      latest_mgi_at = NEW.captured_at,
      updated_at = now()
    WHERE device_id = NEW.device_id
      AND (
        latest_mgi_at IS NULL 
        OR NEW.captured_at > latest_mgi_at
      );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS trigger_calculate_mgi_speed ON device_images;

-- Create new comprehensive trigger
CREATE TRIGGER trigger_calculate_and_rollup_mgi
  BEFORE INSERT OR UPDATE ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION calculate_and_rollup_mgi();

-- Backfill existing device_images to calculate velocity and rollup
DO $$
DECLARE
  v_image RECORD;
BEGIN
  -- Process all images in chronological order
  FOR v_image IN 
    SELECT image_id, device_id, site_id, mgi_score, captured_at
    FROM device_images
    WHERE mgi_score IS NOT NULL
    ORDER BY device_id, captured_at
  LOOP
    -- Trigger will fire and calculate velocity + rollup
    UPDATE device_images
    SET mgi_score = mgi_score -- Force trigger
    WHERE image_id = v_image.image_id;
  END LOOP;
END;
$$;
