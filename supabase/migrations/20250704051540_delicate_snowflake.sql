/*
  # Add Program Phase Day Fields to Gasifier Observations
  
  1. Changes
    - Add daysInThisProgramPhase and todays_day_of_phase columns to gasifier_observations
    - Update create_submission_session to populate these fields from pilot_programs_with_progress
    - Ensure values start at 1 (not 0) to avoid division by zero in analytics
    
  2. Purpose
    - Enable proper tracking of observation days within program phases
    - Maintain consistency between petri and gasifier observations
    - Support advanced analytics that rely on day-based calculations
*/

-- Add the columns to gasifier_observations if they don't exist
ALTER TABLE gasifier_observations 
  ADD COLUMN IF NOT EXISTS daysInThisProgramPhase numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS todays_day_of_phase numeric DEFAULT 0;

-- Update the create_submission_session function to populate the program phase day fields
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
  program_days_count INTEGER;
  program_current_day INTEGER;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  -- Get program phase information from pilot_programs_with_progress
  SELECT 
    GREATEST(1, days_count_this_program), 
    GREATEST(1, day_x_of_program)
  INTO 
    program_days_count, 
    program_current_day
  FROM 
    pilot_programs_with_progress
  WHERE 
    program_id = p_program_id;
    
  -- If no program data found, default to 1 to avoid division by zero
  IF program_days_count IS NULL THEN
    program_days_count := 1;
  END IF;
  
  IF program_current_day IS NULL THEN
    program_current_day := 1;
  END IF;
  
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
    (p_submission_data ->> 'airflow')::airflow_enum,  -- Cast to airflow_enum
    (p_submission_data ->> 'odor_distance')::odor_distance_enum,  -- Cast to odor_distance_enum
    (p_submission_data ->> 'weather')::weather_enum,  -- Cast to weather_enum
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
        -- Add program phase day fields with minimum value of 1
        daysInThisProgramPhase,
        todays_day_of_phase
      )
      VALUES (
        new_submission_id,
        p_site_id,
        p_gasifier_templates -> i ->> 'gasifier_code',
        (p_gasifier_templates -> i ->> 'chemical_type')::chemical_type_enum,  -- Cast to chemical_type_enum
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
        -- Set the program phase day fields, ensuring they start at 1
        program_days_count,
        program_current_day
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
          -- Add program phase day fields with minimum value of 1
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
          -- Set the program phase day fields, ensuring they start at 1
          program_days_count,
          program_current_day
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
            -- Add program phase day fields with minimum value of 1
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
            -- Set the program phase day fields, ensuring they start at 1
            program_days_count,
            program_current_day
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
            -- Add program phase day fields with minimum value of 1
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
            -- Set the program phase day fields, ensuring they start at 1
            program_days_count,
            program_current_day
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

-- Grant permissions to execute the updated function
GRANT EXECUTE ON FUNCTION create_submission_session(UUID, UUID, JSONB, JSONB, JSONB) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION create_submission_session IS 
  'Creates a new submission session with optional templates, properly setting program phase day fields with values starting at 1';