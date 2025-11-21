-- Fix the broken calculate_mgi_speed trigger that references non-existent column
-- This allows device_images inserts to work properly

-- Drop the broken trigger first
DROP TRIGGER IF EXISTS trigger_calculate_mgi_speed ON device_images CASCADE;

-- Recreate the function with correct column reference
CREATE OR REPLACE FUNCTION calculate_mgi_speed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_program_start_date DATE;
  v_capture_date DATE;
  v_days_since_start NUMERIC;
BEGIN
  -- Only calculate speed if mgi_score is being set
  IF NEW.mgi_score IS NOT NULL AND (OLD IS NULL OR OLD.mgi_score IS NULL OR OLD.mgi_score != NEW.mgi_score) THEN
    -- Get program start date through site -> program relationship
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
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER trigger_calculate_mgi_speed
  BEFORE INSERT OR UPDATE ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION calculate_mgi_speed();

-- Verify the fix
SELECT 'MGI speed trigger fixed successfully!' AS status;
