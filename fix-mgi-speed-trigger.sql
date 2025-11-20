-- Fix MGI Speed Calculation Trigger to use correct table join
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
  IF NEW.mgi_score IS NOT NULL AND (OLD.mgi_score IS NULL OR OLD.mgi_score != NEW.mgi_score) THEN
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
