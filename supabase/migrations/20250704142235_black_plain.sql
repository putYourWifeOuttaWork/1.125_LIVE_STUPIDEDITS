/*
  # Fix Observation Update to Preserve Static Fields
  
  1. Changes
    - Add triggers to prevent overwriting of static fields during updates
    - Add comparison logic to preserve template/calculated values
    - Preserve positioning coordinates and program phase information
    
  2. Purpose
    - Prevent accidental nullification of fields that should persist
    - Ensure template-set values are maintained during updates
    - Protect calculated fields like day counters and coordinates
*/

-- Create function to preserve static fields during petri observation updates
CREATE OR REPLACE FUNCTION preserve_petri_static_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Keep original values for fields that aren't explicitly set in the update
  -- This ensures template-provided or backend-calculated fields are preserved

  -- Preserve order_index if not explicitly set
  IF NEW.order_index IS NULL THEN
    NEW.order_index = OLD.order_index;
  END IF;

  -- Preserve daysInThisProgramPhase if not explicitly set or set to zero/null
  IF NEW.daysInThisProgramPhase IS NULL OR NEW.daysInThisProgramPhase = 0 THEN
    NEW.daysInThisProgramPhase = OLD.daysInThisProgramPhase;
  END IF;

  -- Preserve todays_day_of_phase if not explicitly set or set to zero/null
  IF NEW.todays_day_of_phase IS NULL OR NEW.todays_day_of_phase = 0 THEN
    NEW.todays_day_of_phase = OLD.todays_day_of_phase;
  END IF;
  
  -- Preserve growth-related fields if not explicitly set
  IF NEW.growth_progression IS NULL AND OLD.growth_progression IS NOT NULL THEN
    NEW.growth_progression = OLD.growth_progression;
  END IF;
  
  IF NEW.growth_aggression IS NULL AND OLD.growth_aggression IS NOT NULL THEN
    NEW.growth_aggression = OLD.growth_aggression;
  END IF;
  
  IF NEW.growth_velocity IS NULL AND OLD.growth_velocity IS NOT NULL THEN
    NEW.growth_velocity = OLD.growth_velocity;
  END IF;
  
  -- Preserve positioning data if not explicitly set
  IF NEW.footage_from_origin_x IS NULL AND OLD.footage_from_origin_x IS NOT NULL THEN
    NEW.footage_from_origin_x = OLD.footage_from_origin_x;
  END IF;
  
  IF NEW.footage_from_origin_y IS NULL AND OLD.footage_from_origin_y IS NOT NULL THEN
    NEW.footage_from_origin_y = OLD.footage_from_origin_y;
  END IF;
  
  IF NEW.x_position IS NULL AND OLD.x_position IS NOT NULL THEN
    NEW.x_position = OLD.x_position;
  END IF;
  
  IF NEW.y_position IS NULL AND OLD.y_position IS NOT NULL THEN
    NEW.y_position = OLD.y_position;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to preserve static fields during gasifier observation updates
CREATE OR REPLACE FUNCTION preserve_gasifier_static_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Keep original values for fields that aren't explicitly set in the update
  -- This ensures template-provided or backend-calculated fields are preserved

  -- Preserve order_index if not explicitly set
  IF NEW.order_index IS NULL THEN
    NEW.order_index = OLD.order_index;
  END IF;

  -- Preserve daysInThisProgramPhase if not explicitly set or set to zero/null
  IF NEW.daysInThisProgramPhase IS NULL OR NEW.daysInThisProgramPhase = 0 THEN
    NEW.daysInThisProgramPhase = OLD.daysInThisProgramPhase;
  END IF;

  -- Preserve todays_day_of_phase if not explicitly set or set to zero/null
  IF NEW.todays_day_of_phase IS NULL OR NEW.todays_day_of_phase = 0 THEN
    NEW.todays_day_of_phase = OLD.todays_day_of_phase;
  END IF;
  
  -- Preserve measurement-related fields if not explicitly set
  IF NEW.linear_reading IS NULL AND OLD.linear_reading IS NOT NULL THEN
    NEW.linear_reading = OLD.linear_reading;
  END IF;
  
  IF NEW.linear_reduction_nominal IS NULL AND OLD.linear_reduction_nominal IS NOT NULL THEN
    NEW.linear_reduction_nominal = OLD.linear_reduction_nominal;
  END IF;
  
  IF NEW.linear_reduction_per_day IS NULL AND OLD.linear_reduction_per_day IS NOT NULL THEN
    NEW.linear_reduction_per_day = OLD.linear_reduction_per_day;
  END IF;
  
  IF NEW.flow_rate IS NULL AND OLD.flow_rate IS NOT NULL THEN
    NEW.flow_rate = OLD.flow_rate;
  END IF;
  
  IF NEW.daysinthisprogramphase IS NULL AND OLD.daysinthisprogramphase IS NOT NULL THEN
    NEW.daysinthisprogramphase = OLD.daysinthisprogramphase;
  END IF;
  
  IF NEW.todays_day_of_phase IS NULL AND OLD.todays_day_of_phase IS NOT NULL THEN
    NEW.todays_day_of_phase = OLD.todays_day_of_phase;
  END IF;
  
  IF NEW.yesterday_reading IS NULL AND OLD.yesterday_reading IS NOT NULL THEN
    NEW.yesterday_reading = OLD.yesterday_reading;
  END IF;
  
  -- Preserve positioning data if not explicitly set
  IF NEW.footage_from_origin_x IS NULL AND OLD.footage_from_origin_x IS NOT NULL THEN
    NEW.footage_from_origin_x = OLD.footage_from_origin_x;
  END IF;
  
  IF NEW.footage_from_origin_y IS NULL AND OLD.footage_from_origin_y IS NOT NULL THEN
    NEW.footage_from_origin_y = OLD.footage_from_origin_y;
  END IF;
  
  IF NEW.position_x IS NULL AND OLD.position_x IS NOT NULL THEN
    NEW.position_x = OLD.position_x;
  END IF;
  
  IF NEW.position_y IS NULL AND OLD.position_y IS NOT NULL THEN
    NEW.position_y = OLD.position_y;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to ensure static fields are preserved during updates
DROP TRIGGER IF EXISTS preserve_petri_static_fields_trigger ON petri_observations;
CREATE TRIGGER preserve_petri_static_fields_trigger
BEFORE UPDATE ON petri_observations
FOR EACH ROW
EXECUTE PROCEDURE preserve_petri_static_fields();

DROP TRIGGER IF EXISTS preserve_gasifier_static_fields_trigger ON gasifier_observations;
CREATE TRIGGER preserve_gasifier_static_fields_trigger
BEFORE UPDATE ON gasifier_observations
FOR EACH ROW
EXECUTE PROCEDURE preserve_gasifier_static_fields();

-- Add comments for documentation
COMMENT ON FUNCTION preserve_petri_static_fields IS 
  'Preserves static fields like coordinates and program phase days during petri observation updates';
COMMENT ON FUNCTION preserve_gasifier_static_fields IS 
  'Preserves static fields like coordinates, linear readings, and program phase days during gasifier observation updates';