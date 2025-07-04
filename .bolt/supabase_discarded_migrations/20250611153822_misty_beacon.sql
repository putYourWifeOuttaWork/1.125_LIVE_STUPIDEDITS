-- Add outdoor environmental columns to petri_observations and gasifier_observations if they don't exist
DO $$
BEGIN
  -- Check if outdoor_temperature column exists in petri_observations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'petri_observations' AND column_name = 'outdoor_temperature'
  ) THEN
    ALTER TABLE petri_observations ADD COLUMN outdoor_temperature NUMERIC(5,2) NULL;
  END IF;

  -- Check if outdoor_humidity column exists in petri_observations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'petri_observations' AND column_name = 'outdoor_humidity'
  ) THEN
    ALTER TABLE petri_observations ADD COLUMN outdoor_humidity NUMERIC(5,2) NULL;
  END IF;

  -- Check if outdoor_temperature column exists in gasifier_observations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'gasifier_observations' AND column_name = 'outdoor_temperature'
  ) THEN
    ALTER TABLE gasifier_observations ADD COLUMN outdoor_temperature NUMERIC(5,2) NULL;
  END IF;

  -- Check if outdoor_humidity column exists in gasifier_observations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'gasifier_observations' AND column_name = 'outdoor_humidity'
  ) THEN
    ALTER TABLE gasifier_observations ADD COLUMN outdoor_humidity NUMERIC(5,2) NULL;
  END IF;
END
$$;

-- Update the format_object_state function to include the new fields in audit logs
CREATE OR REPLACE FUNCTION format_object_state(
  p_object_type TEXT,
  p_data JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result TEXT;
BEGIN
  -- If data is NULL or empty, return empty string
  IF p_data IS NULL OR p_data = '{}'::JSONB THEN
    RETURN '';
  END IF;

  -- Format differently based on object type
  CASE p_object_type
    -- Format pilot_program state
    WHEN 'pilot_program' THEN
      v_result := 'Program: ' || COALESCE(p_data->>'name', '[unnamed]');
      
      IF p_data ? 'description' THEN
        v_result := v_result || ', Description: ' || SUBSTRING(COALESCE(p_data->>'description', ''), 1, 50);
        IF LENGTH(COALESCE(p_data->>'description', '')) > 50 THEN
          v_result := v_result || '...';
        END IF;
      END IF;
      
      IF p_data ? 'start_date' THEN
        v_result := v_result || ', Start: ' || COALESCE(p_data->>'start_date', '');
      END IF;
      
      IF p_data ? 'end_date' THEN
        v_result := v_result || ', End: ' || COALESCE(p_data->>'end_date', '');
      END IF;
      
      IF p_data ? 'status' THEN
        v_result := v_result || ', Status: ' || COALESCE(p_data->>'status', '');
      END IF;
    
    -- Format site state
    WHEN 'site' THEN
      v_result := 'Site: ' || COALESCE(p_data->>'name', '[unnamed]');
      
      IF p_data ? 'type' THEN
        v_result := v_result || ', Type: ' || COALESCE(p_data->>'type', '');
      END IF;
      
      IF p_data ? 'square_footage' THEN
        v_result := v_result || ', Size: ' || COALESCE(p_data->>'square_footage', '') || ' sq ft';
      END IF;
      
      IF p_data ? 'primary_function' THEN
        v_result := v_result || ', Function: ' || COALESCE(p_data->>'primary_function', '');
      END IF;
      
      IF p_data ? 'total_petris' THEN
        v_result := v_result || ', Petri Samples: ' || COALESCE(p_data->>'total_petris', '0');
      END IF;
      
      IF p_data ? 'total_gasifiers' THEN
        v_result := v_result || ', Gasifiers: ' || COALESCE(p_data->>'total_gasifiers', '0');
      END IF;
    
    -- Format submission state
    WHEN 'submission' THEN
      v_result := 'Submission';
      
      IF p_data ? 'global_submission_id' THEN
        v_result := v_result || ' #' || COALESCE(p_data->>'global_submission_id', '');
      END IF;
      
      IF p_data ? 'temperature' THEN
        v_result := v_result || ', Temp: ' || COALESCE(p_data->>'temperature', '') || '°F';
      END IF;
      
      IF p_data ? 'humidity' THEN
        v_result := v_result || ', Humidity: ' || COALESCE(p_data->>'humidity', '') || '%';
      END IF;
      
      IF p_data ? 'weather' THEN
        v_result := v_result || ', Weather: ' || COALESCE(p_data->>'weather', '');
      END IF;
      
      IF p_data ? 'airflow' THEN
        v_result := v_result || ', Airflow: ' || COALESCE(p_data->>'airflow', '');
      END IF;
      
      IF p_data ? 'odor_distance' THEN
        v_result := v_result || ', Odor Distance: ' || COALESCE(p_data->>'odor_distance', '');
      END IF;
      
      IF p_data ? 'indoor_temperature' AND p_data->>'indoor_temperature' IS NOT NULL THEN
        v_result := v_result || ', Indoor Temp: ' || COALESCE(p_data->>'indoor_temperature', '') || '°F';
      END IF;
      
      IF p_data ? 'indoor_humidity' AND p_data->>'indoor_humidity' IS NOT NULL THEN
        v_result := v_result || ', Indoor Humidity: ' || COALESCE(p_data->>'indoor_humidity', '') || '%';
      END IF;
      
      IF p_data ? 'notes' AND p_data->>'notes' IS NOT NULL AND p_data->>'notes' != '' THEN
        v_result := v_result || ', Notes: ' || SUBSTRING(COALESCE(p_data->>'notes', ''), 1, 30);
        IF LENGTH(COALESCE(p_data->>'notes', '')) > 30 THEN
          v_result := v_result || '...';
        END IF;
      END IF;
    
    -- Format petri_observation state
    WHEN 'petri_observation' THEN
      v_result := 'Petri: ' || COALESCE(p_data->>'petri_code', '[no code]');
      
      IF p_data ? 'plant_type' THEN
        v_result := v_result || ', Plant: ' || COALESCE(p_data->>'plant_type', '');
      END IF;
      
      IF p_data ? 'fungicide_used' THEN
        v_result := v_result || ', Fungicide: ' || COALESCE(p_data->>'fungicide_used', '');
      END IF;
      
      IF p_data ? 'surrounding_water_schedule' THEN
        v_result := v_result || ', Water: ' || COALESCE(p_data->>'surrounding_water_schedule', '');
      END IF;
      
      IF p_data ? 'placement' AND p_data->>'placement' IS NOT NULL THEN
        v_result := v_result || ', Placement: ' || COALESCE(p_data->>'placement', '');
      END IF;
      
      IF p_data ? 'placement_dynamics' AND p_data->>'placement_dynamics' IS NOT NULL THEN
        v_result := v_result || ', Near: ' || COALESCE(p_data->>'placement_dynamics', '');
      END IF;
      
      -- Add outdoor environmental data
      IF p_data ? 'outdoor_temperature' AND p_data->>'outdoor_temperature' IS NOT NULL THEN
        v_result := v_result || ', Outdoor Temp: ' || COALESCE(p_data->>'outdoor_temperature', '') || '°F';
      END IF;
      
      IF p_data ? 'outdoor_humidity' AND p_data->>'outdoor_humidity' IS NOT NULL THEN
        v_result := v_result || ', Outdoor Humidity: ' || COALESCE(p_data->>'outdoor_humidity', '') || '%';
      END IF;
      
      IF p_data ? 'notes' AND p_data->>'notes' IS NOT NULL AND p_data->>'notes' != '' THEN
        v_result := v_result || ', Notes: ' || SUBSTRING(COALESCE(p_data->>'notes', ''), 1, 30);
        IF LENGTH(COALESCE(p_data->>'notes', '')) > 30 THEN
          v_result := v_result || '...';
        END IF;
      END IF;
    
    -- Format gasifier_observation state
    WHEN 'gasifier_observation' THEN
      v_result := 'Gasifier: ' || COALESCE(p_data->>'gasifier_code', '[no code]');
      
      IF p_data ? 'chemical_type' THEN
        v_result := v_result || ', Chemical: ' || COALESCE(p_data->>'chemical_type', '');
      END IF;
      
      IF p_data ? 'anomaly' THEN
        IF (p_data->>'anomaly')::BOOLEAN THEN
          v_result := v_result || ', Has Anomaly: Yes';
        END IF;
      END IF;
      
      IF p_data ? 'placement_height' AND p_data->>'placement_height' IS NOT NULL THEN
        v_result := v_result || ', Height: ' || COALESCE(p_data->>'placement_height', '');
      END IF;
      
      IF p_data ? 'directional_placement' AND p_data->>'directional_placement' IS NOT NULL THEN
        v_result := v_result || ', Position: ' || COALESCE(p_data->>'directional_placement', '');
      END IF;
      
      IF p_data ? 'placement_strategy' AND p_data->>'placement_strategy' IS NOT NULL THEN
        v_result := v_result || ', Strategy: ' || COALESCE(p_data->>'placement_strategy', '');
      END IF;
      
      -- Add outdoor environmental data
      IF p_data ? 'outdoor_temperature' AND p_data->>'outdoor_temperature' IS NOT NULL THEN
        v_result := v_result || ', Outdoor Temp: ' || COALESCE(p_data->>'outdoor_temperature', '') || '°F';
      END IF;
      
      IF p_data ? 'outdoor_humidity' AND p_data->>'outdoor_humidity' IS NOT NULL THEN
        v_result := v_result || ', Outdoor Humidity: ' || COALESCE(p_data->>'outdoor_humidity', '') || '%';
      END IF;
      
      IF p_data ? 'notes' AND p_data->>'notes' IS NOT NULL AND p_data->>'notes' != '' THEN
        v_result := v_result || ', Notes: ' || SUBSTRING(COALESCE(p_data->>'notes', ''), 1, 30);
        IF LENGTH(COALESCE(p_data->>'notes', '')) > 30 THEN
          v_result := v_result || '...';
        END IF;
      END IF;
    
    -- Format program_user state
    WHEN 'program_user' THEN
      v_result := 'User';
      
      IF p_data ? 'user_email' THEN
        v_result := v_result || ': ' || COALESCE(p_data->>'user_email', '[no email]');
      END IF;
      
      IF p_data ? 'role' THEN
        v_result := v_result || ', Role: ' || COALESCE(p_data->>'role', '');
      END IF;
    
    -- Format user state
    WHEN 'user' THEN
      v_result := 'User';
      
      IF p_data ? 'user_email' THEN
        v_result := v_result || ': ' || COALESCE(p_data->>'user_email', '[no email]');
      END IF;
      
      IF p_data ? 'is_company_admin' THEN
        IF (p_data->>'is_company_admin')::BOOLEAN THEN
          v_result := v_result || ', Company Admin: Yes';
        ELSE
          v_result := v_result || ', Company Admin: No';
        END IF;
      END IF;
      
      IF p_data ? 'is_active' THEN
        IF (p_data->>'is_active')::BOOLEAN THEN
          v_result := v_result || ', Active: Yes';
        ELSE
          v_result := v_result || ', Active: No';
        END IF;
      END IF;
    
    -- Default case for other object types
    ELSE
      v_result := COALESCE(p_data::TEXT, '');
  END CASE;
  
  RETURN v_result;
END;
$$;

-- Add comments for documentation
COMMENT ON COLUMN petri_observations.outdoor_temperature IS 'Temperature recorded at the time this observation was made (Fahrenheit)';
COMMENT ON COLUMN petri_observations.outdoor_humidity IS 'Humidity recorded at the time this observation was made (percentage)';
COMMENT ON COLUMN gasifier_observations.outdoor_temperature IS 'Temperature recorded at the time this observation was made (Fahrenheit)';
COMMENT ON COLUMN gasifier_observations.outdoor_humidity IS 'Humidity recorded at the time this observation was made (percentage)';