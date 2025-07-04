/*
  # Update Program Phase Day Fields

  1. New Features
    - Update create_submission_session function to properly populate program phase day fields
    - Create new function to get current program phase information
    - Apply program day numbers from parent program to observations
    
  2. Purpose
    - Ensure todays_day_of_phase reflects the actual day number in the program
    - Support proper tracking of program progress in petri and gasifier observations
    - Enable accurate calculation of growth metrics over time
*/

-- Create function to get current program phase information
CREATE OR REPLACE FUNCTION get_current_program_phase_info(p_program_id UUID)
RETURNS TABLE (
  days_in_phase INTEGER,
  current_day_in_phase INTEGER,
  phase_number INTEGER,
  phase_type TEXT
) AS $$
DECLARE
  program_rec RECORD;
  current_phase JSONB;
  days_count INTEGER;
  current_day INTEGER;
  phase_num INTEGER;
  phase_typ TEXT;
BEGIN
  -- Get program details with progress metrics
  SELECT * INTO program_rec
  FROM pilot_programs_with_progress
  WHERE program_id = p_program_id;
  
  IF NOT FOUND THEN
    -- Return defaults if program not found
    days_count := 1;
    current_day := 1;
    phase_num := 1;
    phase_typ := 'control';
  ELSE
    -- Get days count and current day from program
    days_count := GREATEST(1, program_rec.days_count_this_program);
    current_day := GREATEST(1, program_rec.day_x_of_program);
    
    -- Get the current/last phase from the phases array
    IF program_rec.phases IS NOT NULL AND jsonb_array_length(program_rec.phases) > 0 THEN
      -- Get the last phase in the array (most recent)
      current_phase := program_rec.phases -> (jsonb_array_length(program_rec.phases) - 1);
      phase_num := (current_phase ->> 'phase_number')::INTEGER;
      phase_typ := current_phase ->> 'phase_type';
    ELSE
      -- Default values if no phases found
      phase_num := 1;
      phase_typ := 'control';
    END IF;
  END IF;
  
  -- Return the results
  RETURN QUERY SELECT 
    days_count, 
    current_day, 
    phase_num, 
    phase_typ;
END;
$$ LANGUAGE plpgsql;

-- Update the create_submission_session function to properly populate program phase day fields
CREATE OR REPLACE FUNCTION create_submission_session(
  p_program_id UUID,
  p_site_id UUID,
  p_submission_data JSONB,
  p_gasifier_templates JSONB DEFAULT NULL,
  p_petri_templates JSONB DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  new_submission_id UUID;
  new_session_id UUID;
  template_gasifier_count INTEGER := 0;
  template_petri_count INTEGER := 0;
  current_user_id UUID;
  result JSONB;
  phase_info RECORD;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  -- Get program phase information
  SELECT * INTO phase_info
  FROM get_current_program_phase_info(p_program_id);
  
  -- Create the submission with proper enum type casting
  INSERT INTO submissions (
    site_id,
    program_id,
    temperature,
    humidity,
    airflow,
    odor_distance,
    weather,
    notes,
    created_by,
    indoor_temperature,
    indoor_humidity,
    submission_timezone
  )
  VALUES (
    p_site_id,
    p_program_id,
    (p_submission_data ->> 'temperature')::numeric,
    (p_submission_data ->> 'humidity')::numeric,
    (p_submission_data ->> 'airflow')::airflow_enum,
    (p_submission_data ->> 'odor_distance')::odor_distance_enum,
    (p_submission_data ->> 'weather')::weather_enum,
    (p_submission_data ->> 'notes')::text,
    current_user_id,
    CASE WHEN p_submission_data ? 'indoor_temperature' AND (p_submission_data ->> 'indoor_temperature') != '' 
      THEN (p_submission_data ->> 'indoor_temperature')::numeric 
      ELSE NULL 
    END,
    CASE WHEN p_submission_data ? 'indoor_humidity' AND (p_submission_data ->> 'indoor_humidity') != '' 
      THEN (p_submission_data ->> 'indoor_humidity')::numeric 
      ELSE NULL 
    END,
    CASE WHEN p_submission_data ? 'timezone' AND (p_submission_data ->> 'timezone') != '' 
      THEN (p_submission_data ->> 'timezone')::text 
      ELSE NULL 
    END
  )
  RETURNING submission_id INTO new_submission_id;
  
  -- Create the session
  INSERT INTO submission_sessions (
    submission_id,
    site_id,
    program_id,
    opened_by_user_id,
    session_status
  )
  VALUES (
    new_submission_id,
    p_site_id,
    p_program_id,
    current_user_id,
    'Opened'
  )
  RETURNING session_id INTO new_session_id;
  
  -- If gasifier templates were provided, create gasifier observations
  IF p_gasifier_templates IS NOT NULL AND jsonb_array_length(p_gasifier_templates) > 0 THEN
    template_gasifier_count := jsonb_array_length(p_gasifier_templates);
    
    FOR i IN 0..template_gasifier_count-1 LOOP
      INSERT INTO gasifier_observations (
        submission_id,
        site_id,
        gasifier_code,
        chemical_type,
        placement_height,
        directional_placement,
        placement_strategy,
        notes,
        anomaly,
        order_index,
        footage_from_origin_x,
        footage_from_origin_y,
        -- Set the program phase day fields using actual program data
        daysInThisProgramPhase,
        todays_day_of_phase
      )
      VALUES (
        new_submission_id,
        p_site_id,
        p_gasifier_templates -> i ->> 'gasifier_code',
        (p_gasifier_templates -> i ->> 'chemical_type')::chemical_type_enum,
        CASE WHEN p_gasifier_templates -> i ? 'placement_height' THEN 
          (p_gasifier_templates -> i ->> 'placement_height')::placement_height_enum ELSE NULL 
        END,
        CASE WHEN p_gasifier_templates -> i ? 'directional_placement' THEN 
          (p_gasifier_templates -> i ->> 'directional_placement')::directional_placement_enum ELSE NULL 
        END,
        CASE WHEN p_gasifier_templates -> i ? 'placement_strategy' THEN 
          (p_gasifier_templates -> i ->> 'placement_strategy')::placement_strategy_enum ELSE NULL 
        END,
        p_gasifier_templates -> i ->> 'notes',
        CASE WHEN p_gasifier_templates -> i ? 'anomaly' AND 
                (p_gasifier_templates -> i ->> 'anomaly')::boolean = true THEN true 
             ELSE false 
        END,
        i,
        CASE WHEN p_gasifier_templates -> i ? 'footage_from_origin_x' THEN 
          (p_gasifier_templates -> i ->> 'footage_from_origin_x')::numeric 
        ELSE 0 
        END,
        CASE WHEN p_gasifier_templates -> i ? 'footage_from_origin_y' THEN 
          (p_gasifier_templates -> i ->> 'footage_from_origin_y')::numeric 
        ELSE 0 
        END,
        -- Use the phase_info values, ensuring they're at least 1
        GREATEST(1, phase_info.days_in_phase),
        GREATEST(1, phase_info.current_day_in_phase)
      );
    END LOOP;
  END IF;

  -- If petri templates were provided, create petri observations
  IF p_petri_templates IS NOT NULL AND jsonb_array_length(p_petri_templates) > 0 THEN
    template_petri_count := jsonb_array_length(p_petri_templates);
    
    -- Temporary variables for split image handling
    DECLARE
      main_source_id UUID;
      main_petri_code TEXT;
      is_split_source BOOLEAN;
      split_codes JSONB;
      left_code TEXT;
      right_code TEXT;
      phase_settings JSONB;
    BEGIN
      FOR i IN 0..template_petri_count-1 LOOP
        -- Check if this is a split image template
        is_split_source := CASE 
          WHEN p_petri_templates -> i ? 'is_split_image_template' AND 
               (p_petri_templates -> i ->> 'is_split_image_template')::boolean = true THEN true
          ELSE false
        END;
        
        -- Get split codes if available
        split_codes := CASE
          WHEN is_split_source = true AND p_petri_templates -> i ? 'split_codes' THEN
            p_petri_templates -> i -> 'split_codes'
          ELSE NULL
        END;
        
        -- Extract left and right codes if split codes exist
        IF split_codes IS NOT NULL AND jsonb_array_length(split_codes) >= 2 THEN
          left_code := split_codes ->> 0;
          right_code := split_codes ->> 1;
        ELSE
          left_code := NULL;
          right_code := NULL;
        END IF;
        
        -- Create phase settings object for split images
        IF is_split_source = true AND left_code IS NOT NULL AND right_code IS NOT NULL THEN
          main_petri_code := p_petri_templates -> i ->> 'petri_code';
          
          phase_settings := jsonb_build_object(
            'position', 'main',
            'base_petri_code', main_petri_code,
            'left_code', left_code,
            'right_code', right_code
          );
        ELSE
          phase_settings := NULL;
        END IF;
      
        -- Insert main petri observation with proper enum casting
        INSERT INTO petri_observations (
          submission_id,
          site_id,
          petri_code,
          fungicide_used,
          surrounding_water_schedule,
          plant_type,
          placement,
          placement_dynamics,
          notes,
          is_image_split,
          is_split_source,
          split_processed,
          phase_observation_settings,
          order_index,
          -- Set the program phase day fields using actual program data
          daysInThisProgramPhase,
          todays_day_of_phase
        )
        VALUES (
          new_submission_id,
          p_site_id,
          p_petri_templates -> i ->> 'petri_code',
          (p_petri_templates -> i ->> 'fungicide_used')::fungicide_used_enum,
          (p_petri_templates -> i ->> 'surrounding_water_schedule')::water_schedule_enum,
          COALESCE((p_petri_templates -> i ->> 'plant_type')::plant_type_enum, 'Other Fresh Perishable'::plant_type_enum),
          CASE WHEN p_petri_templates -> i ? 'placement' THEN 
            (p_petri_templates -> i ->> 'placement')::petri_placement_enum ELSE NULL 
          END,
          CASE WHEN p_petri_templates -> i ? 'placement_dynamics' THEN 
            (p_petri_templates -> i ->> 'placement_dynamics')::petri_placement_dynamics_enum ELSE NULL 
          END,
          p_petri_templates -> i ->> 'notes',
          is_split_source,
          is_split_source,
          false,
          phase_settings,
          i,
          -- Use the phase_info values, ensuring they're at least 1
          GREATEST(1, phase_info.days_in_phase),
          GREATEST(1, phase_info.current_day_in_phase)
        )
        RETURNING observation_id INTO main_source_id;
        
        -- If this is a split image template, create left and right child observations
        IF is_split_source = true AND left_code IS NOT NULL AND right_code IS NOT NULL THEN
          -- Create left petri observation
          INSERT INTO petri_observations (
            submission_id,
            site_id,
            petri_code,
            fungicide_used,
            surrounding_water_schedule,
            plant_type,
            placement,
            placement_dynamics,
            notes,
            is_image_split,
            is_split_source,
            split_processed,
            phase_observation_settings,
            main_petri_id,
            order_index,
            -- Set the program phase day fields using actual program data
            daysInThisProgramPhase,
            todays_day_of_phase
          )
          VALUES (
            new_submission_id,
            p_site_id,
            left_code,
            (p_petri_templates -> i ->> 'fungicide_used')::fungicide_used_enum,
            (p_petri_templates -> i ->> 'surrounding_water_schedule')::water_schedule_enum,
            COALESCE((p_petri_templates -> i ->> 'plant_type')::plant_type_enum, 'Other Fresh Perishable'::plant_type_enum),
            CASE WHEN p_petri_templates -> i ? 'placement' THEN 
              (p_petri_templates -> i ->> 'placement')::petri_placement_enum ELSE NULL 
            END,
            CASE WHEN p_petri_templates -> i ? 'placement_dynamics' THEN 
              (p_petri_templates -> i ->> 'placement_dynamics')::petri_placement_dynamics_enum ELSE NULL 
            END,
            p_petri_templates -> i ->> 'notes',
            true,
            false,
            false,
            jsonb_build_object('position', 'left', 'base_petri_code', main_petri_code),
            main_source_id,
            i,
            -- Use the phase_info values, ensuring they're at least 1
            GREATEST(1, phase_info.days_in_phase),
            GREATEST(1, phase_info.current_day_in_phase)
          );
          
          -- Create right petri observation
          INSERT INTO petri_observations (
            submission_id,
            site_id,
            petri_code,
            fungicide_used,
            surrounding_water_schedule,
            plant_type,
            placement,
            placement_dynamics,
            notes,
            is_image_split,
            is_split_source,
            split_processed,
            phase_observation_settings,
            main_petri_id,
            order_index,
            -- Set the program phase day fields using actual program data
            daysInThisProgramPhase,
            todays_day_of_phase
          )
          VALUES (
            new_submission_id,
            p_site_id,
            right_code,
            (p_petri_templates -> i ->> 'fungicide_used')::fungicide_used_enum,
            (p_petri_templates -> i ->> 'surrounding_water_schedule')::water_schedule_enum,
            COALESCE((p_petri_templates -> i ->> 'plant_type')::plant_type_enum, 'Other Fresh Perishable'::plant_type_enum),
            CASE WHEN p_petri_templates -> i ? 'placement' THEN 
              (p_petri_templates -> i ->> 'placement')::petri_placement_enum ELSE NULL 
            END,
            CASE WHEN p_petri_templates -> i ? 'placement_dynamics' THEN 
              (p_petri_templates -> i ->> 'placement_dynamics')::petri_placement_dynamics_enum ELSE NULL 
            END,
            p_petri_templates -> i ->> 'notes',
            true,
            false,
            false,
            jsonb_build_object('position', 'right', 'base_petri_code', main_petri_code),
            main_source_id,
            i,
            -- Use the phase_info values, ensuring they're at least 1
            GREATEST(1, phase_info.days_in_phase),
            GREATEST(1, phase_info.current_day_in_phase)
          );
        END IF;
      END LOOP;
    END;
  END IF;

  -- Return success with IDs for frontend to use
  result := jsonb_build_object(
    'success', true,
    'submission_id', new_submission_id,
    'session_id', new_session_id,
    'message', format('Successfully created submission and session with %s gasifiers and %s petris', 
                    template_gasifier_count::text, template_petri_count::text)
  );
  
  RETURN result;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Error creating submission session: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to update phase day fields for existing observations
CREATE OR REPLACE FUNCTION update_phase_day_fields_for_program(p_program_id UUID)
RETURNS JSONB AS $$
DECLARE
  phase_info RECORD;
  updated_petri_count INTEGER := 0;
  updated_gasifier_count INTEGER := 0;
BEGIN
  -- Get program phase information
  SELECT * INTO phase_info
  FROM get_current_program_phase_info(p_program_id);
  
  -- Update petri observations
  WITH updated_petri AS (
    UPDATE petri_observations po
    SET 
      daysInThisProgramPhase = GREATEST(1, phase_info.days_in_phase),
      todays_day_of_phase = GREATEST(1, phase_info.current_day_in_phase)
    FROM submissions s
    WHERE 
      po.submission_id = s.submission_id AND
      s.program_id = p_program_id AND
      (po.daysInThisProgramPhase IS NULL OR po.daysInThisProgramPhase <= 0 OR
       po.todays_day_of_phase IS NULL OR po.todays_day_of_phase <= 0)
    RETURNING po.observation_id
  )
  SELECT COUNT(*) INTO updated_petri_count FROM updated_petri;
  
  -- Update gasifier observations
  WITH updated_gasifier AS (
    UPDATE gasifier_observations go
    SET 
      daysInThisProgramPhase = GREATEST(1, phase_info.days_in_phase),
      todays_day_of_phase = GREATEST(1, phase_info.current_day_in_phase)
    FROM submissions s
    WHERE 
      go.submission_id = s.submission_id AND
      s.program_id = p_program_id AND
      (go.daysInThisProgramPhase IS NULL OR go.daysInThisProgramPhase <= 0 OR
       go.todays_day_of_phase IS NULL OR go.todays_day_of_phase <= 0)
    RETURNING go.observation_id
  )
  SELECT COUNT(*) INTO updated_gasifier_count FROM updated_gasifier;
  
  -- Return results
  RETURN jsonb_build_object(
    'success', true,
    'program_id', p_program_id,
    'updated_petri_count', updated_petri_count,
    'updated_gasifier_count', updated_gasifier_count,
    'days_in_phase', phase_info.days_in_phase,
    'current_day_in_phase', phase_info.current_day_in_phase,
    'phase_number', phase_info.phase_number,
    'phase_type', phase_info.phase_type
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Error updating phase day fields: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run update on all existing active programs to fix data
DO $$
DECLARE
  program_rec RECORD;
BEGIN
  -- Only update active programs
  FOR program_rec IN 
    SELECT program_id FROM pilot_programs WHERE status = 'active'
  LOOP
    PERFORM update_phase_day_fields_for_program(program_rec.program_id);
  END LOOP;
END $$;

-- Grant permissions to execute the updated functions
GRANT EXECUTE ON FUNCTION get_current_program_phase_info(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_submission_session(UUID, UUID, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_phase_day_fields_for_program(UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION get_current_program_phase_info IS 
  'Gets current phase information for a program including days count and current day';
COMMENT ON FUNCTION create_submission_session IS 
  'Creates a new submission session with program phase day fields properly populated';
COMMENT ON FUNCTION update_phase_day_fields_for_program IS
  'Updates phase day fields for all observations in a program using current program phase info';