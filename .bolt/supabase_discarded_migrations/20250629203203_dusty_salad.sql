-- Drop ALL versions of create_submission_session regardless of parameter signatures
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'create_submission_session' 
    AND pg_function_is_visible(oid)
  ) THEN
    EXECUTE 'DROP FUNCTION IF EXISTS create_submission_session CASCADE';
  END IF;
END $$;

-- Create a new version of the function with alphabetically ordered parameters
CREATE OR REPLACE FUNCTION public.create_submission_session(
  p_gasifier_templates JSONB DEFAULT NULL,
  p_petri_templates JSONB DEFAULT NULL,
  p_program_id UUID,
  p_site_id UUID,
  p_submission_data JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_submission_id UUID;
  v_session_id UUID;
  v_petri_observation_id UUID;
  v_gasifier_observation_id UUID;
  v_result JSONB;
  v_petri_template JSONB;
  v_gasifier_template JSONB;
  v_user_id UUID;
  v_pair_id TEXT;
  v_left_code TEXT;
  v_right_code TEXT;
  -- Variables for petri enums
  v_plant_type plant_type_enum;
  v_fungicide_used fungicide_used_enum;
  v_water_schedule water_schedule_enum;
  v_placement petri_placement_enum;
  v_placement_dynamics petri_placement_dynamics_enum;
  -- Variables for gasifier enums
  v_chemical_type chemical_type_enum;
  v_placement_height placement_height_enum;
  v_directional_placement directional_placement_enum;
  v_placement_strategy placement_strategy_enum;
BEGIN
  -- Get the current user ID
  v_user_id := auth.uid();

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
    (p_submission_data->>'temperature')::NUMERIC,
    (p_submission_data->>'humidity')::NUMERIC,
    (p_submission_data->>'airflow')::airflow_enum,
    (p_submission_data->>'odor_distance')::odor_distance_enum,
    (p_submission_data->>'weather')::weather_enum,
    p_submission_data->>'notes',
    v_user_id,
    NULLIF((p_submission_data->>'indoor_temperature')::TEXT, '')::NUMERIC,
    NULLIF((p_submission_data->>'indoor_humidity')::TEXT, '')::NUMERIC,
    p_submission_data->>'timezone'
  )
  RETURNING submission_id INTO v_submission_id;

  -- Create the submission session
  INSERT INTO submission_sessions (
    submission_id,
    site_id,
    program_id,
    opened_by_user_id,
    session_status
  )
  VALUES (
    v_submission_id,
    p_site_id,
    p_program_id,
    v_user_id,
    'Opened'
  )
  RETURNING session_id INTO v_session_id;

  -- Create petri observations from templates if provided
  IF p_petri_templates IS NOT NULL AND jsonb_array_length(p_petri_templates) > 0 THEN
    FOR v_petri_template IN SELECT * FROM jsonb_array_elements(p_petri_templates)
    LOOP
      -- Set defaults for required enum fields and handle empty strings
      v_plant_type := COALESCE(NULLIF(v_petri_template->>'plant_type', ''), 'Other Fresh Perishable')::plant_type_enum;
      v_fungicide_used := COALESCE(NULLIF(v_petri_template->>'fungicide_used', ''), 'No')::fungicide_used_enum;
      v_water_schedule := COALESCE(NULLIF(v_petri_template->>'surrounding_water_schedule', ''), 'Daily')::water_schedule_enum;
      
      -- Handle optional enum fields - explicitly set to NULL if empty string
      IF v_petri_template->>'placement' IS NOT NULL AND v_petri_template->>'placement' <> '' THEN
        v_placement := (v_petri_template->>'placement')::petri_placement_enum;
      ELSE
        v_placement := NULL;
      END IF;
      
      IF v_petri_template->>'placement_dynamics' IS NOT NULL AND v_petri_template->>'placement_dynamics' <> '' THEN
        v_placement_dynamics := (v_petri_template->>'placement_dynamics')::petri_placement_dynamics_enum;
      ELSE
        v_placement_dynamics := NULL;
      END IF;

      -- Check if this is a split image template
      IF (v_petri_template->>'is_split_image_template')::BOOLEAN IS TRUE THEN
        -- Generate a unique pair ID to link the two observations
        v_pair_id := gen_random_uuid()::TEXT;
        
        -- Get the split codes
        v_left_code := jsonb_array_element_text(v_petri_template->'split_codes', 0);
        v_right_code := jsonb_array_element_text(v_petri_template->'split_codes', 1);
        
        -- If we don't have both codes, use defaults based on the original code
        IF v_left_code IS NULL OR v_left_code = '' OR v_right_code IS NULL OR v_right_code = '' THEN
          v_left_code := (v_petri_template->>'petri_code') || '_Left';
          v_right_code := (v_petri_template->>'petri_code') || '_Right';
        END IF;
        
        -- Create the left side observation
        INSERT INTO petri_observations (
          submission_id,
          site_id,
          petri_code,
          plant_type,
          fungicide_used,
          surrounding_water_schedule,
          placement,
          placement_dynamics,
          notes,
          is_image_split,
          phase_observation_settings
        )
        VALUES (
          v_submission_id,
          p_site_id,
          v_left_code,
          v_plant_type,
          v_fungicide_used,
          v_water_schedule,
          v_placement,
          v_placement_dynamics,
          v_petri_template->>'notes',
          TRUE,
          jsonb_build_object(
            'split_pair_id', v_pair_id,
            'position', 'left',
            'left_code', v_left_code,
            'right_code', v_right_code
          )
        );
        
        -- Create the right side observation
        INSERT INTO petri_observations (
          submission_id,
          site_id,
          petri_code,
          plant_type,
          fungicide_used,
          surrounding_water_schedule,
          placement,
          placement_dynamics,
          notes,
          is_image_split,
          phase_observation_settings
        )
        VALUES (
          v_submission_id,
          p_site_id,
          v_right_code,
          v_plant_type,
          v_fungicide_used,
          v_water_schedule,
          v_placement,
          v_placement_dynamics,
          v_petri_template->>'notes',
          TRUE,
          jsonb_build_object(
            'split_pair_id', v_pair_id,
            'position', 'right',
            'left_code', v_left_code,
            'right_code', v_right_code
          )
        );
      ELSE
        -- Normal non-split petri observation
        INSERT INTO petri_observations (
          submission_id,
          site_id,
          petri_code,
          plant_type,
          fungicide_used,
          surrounding_water_schedule,
          placement,
          placement_dynamics,
          notes
        )
        VALUES (
          v_submission_id,
          p_site_id,
          v_petri_template->>'petri_code',
          v_plant_type,
          v_fungicide_used,
          v_water_schedule,
          v_placement,
          v_placement_dynamics,
          v_petri_template->>'notes'
        );
      END IF;
    END LOOP;
  END IF;

  -- Create gasifier observations from templates if provided
  IF p_gasifier_templates IS NOT NULL AND jsonb_array_length(p_gasifier_templates) > 0 THEN
    FOR v_gasifier_template IN SELECT * FROM jsonb_array_elements(p_gasifier_templates)
    LOOP
      -- Default required enum values if null or empty
      v_chemical_type := COALESCE(NULLIF(v_gasifier_template->>'chemical_type', ''), 'CLO2')::chemical_type_enum;
      
      -- Handle optional enum fields - explicitly set to NULL if empty string
      IF v_gasifier_template->>'placement_height' IS NOT NULL AND v_gasifier_template->>'placement_height' <> '' THEN
        v_placement_height := (v_gasifier_template->>'placement_height')::placement_height_enum;
      ELSE
        v_placement_height := NULL;
      END IF;
      
      IF v_gasifier_template->>'directional_placement' IS NOT NULL AND v_gasifier_template->>'directional_placement' <> '' THEN
        v_directional_placement := (v_gasifier_template->>'directional_placement')::directional_placement_enum;
      ELSE
        v_directional_placement := NULL;
      END IF;
      
      IF v_gasifier_template->>'placement_strategy' IS NOT NULL AND v_gasifier_template->>'placement_strategy' <> '' THEN
        v_placement_strategy := (v_gasifier_template->>'placement_strategy')::placement_strategy_enum;
      ELSE
        v_placement_strategy := NULL;
      END IF;
      
      INSERT INTO gasifier_observations (
        submission_id,
        site_id,
        gasifier_code,
        chemical_type,
        placement_height,
        directional_placement,
        placement_strategy,
        notes,
        anomaly
      )
      VALUES (
        v_submission_id,
        p_site_id,
        v_gasifier_template->>'gasifier_code',
        v_chemical_type,
        v_placement_height,
        v_directional_placement,
        v_placement_strategy,
        v_gasifier_template->>'notes',
        COALESCE((v_gasifier_template->>'anomaly')::BOOLEAN, FALSE)
      );
    END LOOP;
  END IF;

  -- Build the result object
  v_result := jsonb_build_object(
    'success', TRUE,
    'submission_id', v_submission_id,
    'session_id', v_session_id
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.create_submission_session TO authenticated;

-- Add comment to function
COMMENT ON FUNCTION public.create_submission_session IS 'Creates a submission and session with optional petri and gasifier observations from templates. Parameters are in alphabetical order to ensure correct PostgREST routing.';