/*
  # Add Support for Gasifier Coordinates in Templates

  1. New Features
    - Update the `update_site_template_defaults` function to support footage_from_origin_x and footage_from_origin_y
    - Update the `create_submission_session` function to populate these values when creating new gasifier observations
    
  2. Purpose
    - Enable storing predetermined x/y coordinates in gasifier templates
    - Support automatic positioning of gasifiers during session creation
    - Maintain these positions throughout submission lifecycle
*/

-- Update the update_site_template_defaults function to handle the new coordinate fields
CREATE OR REPLACE FUNCTION update_site_template_defaults(
  p_site_id UUID,
  p_submission_defaults JSONB,
  p_petri_defaults JSONB,
  p_gasifier_defaults JSONB
) RETURNS JSONB AS $$
DECLARE
  updated_site JSONB;
BEGIN
  -- Validate coordinate values in gasifier defaults if they exist
  IF p_gasifier_defaults IS NOT NULL AND jsonb_array_length(p_gasifier_defaults) > 0 THEN
    FOR i IN 0..jsonb_array_length(p_gasifier_defaults) - 1 LOOP
      -- Ensure footage_from_origin_x and footage_from_origin_y are valid numbers >= 0 if present
      IF p_gasifier_defaults -> i ? 'footage_from_origin_x' THEN
        IF (p_gasifier_defaults -> i ->> 'footage_from_origin_x')::numeric < 0 THEN
          RAISE EXCEPTION 'footage_from_origin_x must be >= 0';
        END IF;
      END IF;
      
      IF p_gasifier_defaults -> i ? 'footage_from_origin_y' THEN
        IF (p_gasifier_defaults -> i ->> 'footage_from_origin_y')::numeric < 0 THEN
          RAISE EXCEPTION 'footage_from_origin_y must be >= 0';
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  -- Update the site with the new defaults
  UPDATE sites
  SET 
    submission_defaults = p_submission_defaults,
    petri_defaults = p_petri_defaults,
    gasifier_defaults = p_gasifier_defaults
  WHERE site_id = p_site_id
  RETURNING to_jsonb(sites) INTO updated_site;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'site', updated_site
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Error updating site template defaults: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the create_submission_session function to handle the new coordinate fields
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
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  -- Create the submission
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
    (p_submission_data ->> 'airflow')::text,
    (p_submission_data ->> 'odor_distance')::text,
    (p_submission_data ->> 'weather')::text,
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
        footage_from_origin_x, -- Add support for coordinates
        footage_from_origin_y  -- Add support for coordinates
      )
      VALUES (
        new_submission_id,
        p_site_id,
        p_gasifier_templates -> i ->> 'gasifier_code',
        (p_gasifier_templates -> i ->> 'chemical_type'),
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
        -- Add the coordinate values from the template (defaulting to 0 if not present)
        CASE WHEN p_gasifier_templates -> i ? 'footage_from_origin_x' THEN 
          (p_gasifier_templates -> i ->> 'footage_from_origin_x')::numeric 
        ELSE 0 
        END,
        CASE WHEN p_gasifier_templates -> i ? 'footage_from_origin_y' THEN 
          (p_gasifier_templates -> i ->> 'footage_from_origin_y')::numeric 
        ELSE 0 
        END
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
      
        -- Insert main petri observation
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
          order_index
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
          is_split_source,  -- is_image_split
          is_split_source,  -- is_split_source
          false,            -- split_processed
          phase_settings,   -- phase_observation_settings
          i
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
            order_index
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
            true,             -- is_image_split
            false,            -- is_split_source
            false,            -- split_processed
            jsonb_build_object('position', 'left', 'base_petri_code', main_petri_code),
            main_source_id,   -- main_petri_id
            i
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
            order_index
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
            true,             -- is_image_split
            false,            -- is_split_source
            false,            -- split_processed
            jsonb_build_object('position', 'right', 'base_petri_code', main_petri_code),
            main_source_id,   -- main_petri_id
            i
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

-- Grant permissions to execute the updated functions
GRANT EXECUTE ON FUNCTION update_site_template_defaults(UUID, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION create_submission_session(UUID, UUID, JSONB, JSONB, JSONB) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION update_site_template_defaults IS 
  'Updates a site template with submission defaults, petri defaults, and gasifier defaults including footage coordinates';
COMMENT ON FUNCTION create_submission_session IS 
  'Creates a new submission session with optional templates, including gasifier positioning coordinates';