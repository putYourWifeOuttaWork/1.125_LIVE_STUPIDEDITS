/*
  # Fix plant_type Enum Casting in create_submission_session
  
  1. Changes
    - Fix the create_submission_session function to properly cast plant_type to plant_type_enum
    - Ensure proper enum casting for all fields in petri observations
    
  2. Purpose
    - Fix "column plant_type is of type plant_type_enum but expression is of type text" error
    - Ensure consistent enum typing throughout the function
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS public.create_submission_session(UUID, UUID, JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.create_submission_session();

-- Create the updated function with correct enum casting
CREATE OR REPLACE FUNCTION public.create_submission_session(
  p_site_id UUID,
  p_program_id UUID,
  p_submission_data JSONB,
  p_petri_templates JSONB DEFAULT NULL,
  p_gasifier_templates JSONB DEFAULT NULL
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
    (p_submission_data->>'indoor_temperature')::NUMERIC,
    (p_submission_data->>'indoor_humidity')::NUMERIC,
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
      -- Check if this is a split image template
      IF (v_petri_template->>'is_split_image_template')::BOOLEAN IS TRUE THEN
        -- Generate a unique pair ID to link the two observations
        v_pair_id := gen_random_uuid()::TEXT;
        
        -- Get the split codes
        v_left_code := jsonb_array_element_text(v_petri_template->'split_codes', 0);
        v_right_code := jsonb_array_element_text(v_petri_template->'split_codes', 1);
        
        -- If we don't have both codes, use defaults based on the original code
        IF v_left_code IS NULL OR v_right_code IS NULL THEN
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
          (v_petri_template->>'plant_type')::plant_type_enum,
          (v_petri_template->>'fungicide_used')::fungicide_used_enum,
          (v_petri_template->>'surrounding_water_schedule')::water_schedule_enum,
          (v_petri_template->>'placement')::petri_placement_enum,
          (v_petri_template->>'placement_dynamics')::petri_placement_dynamics_enum,
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
          (v_petri_template->>'plant_type')::plant_type_enum,
          (v_petri_template->>'fungicide_used')::fungicide_used_enum,
          (v_petri_template->>'surrounding_water_schedule')::water_schedule_enum,
          (v_petri_template->>'placement')::petri_placement_enum,
          (v_petri_template->>'placement_dynamics')::petri_placement_dynamics_enum,
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
          (v_petri_template->>'plant_type')::plant_type_enum,
          (v_petri_template->>'fungicide_used')::fungicide_used_enum,
          (v_petri_template->>'surrounding_water_schedule')::water_schedule_enum,
          (v_petri_template->>'placement')::petri_placement_enum,
          (v_petri_template->>'placement_dynamics')::petri_placement_dynamics_enum,
          v_petri_template->>'notes'
        );
      END IF;
    END LOOP;
  END IF;

  -- Create gasifier observations from templates if provided
  IF p_gasifier_templates IS NOT NULL AND jsonb_array_length(p_gasifier_templates) > 0 THEN
    FOR v_gasifier_template IN SELECT * FROM jsonb_array_elements(p_gasifier_templates)
    LOOP
      INSERT INTO gasifier_observations (
        submission_id,
        site_id,
        gasifier_code,
        chemical_type,
        placement_height,
        directional_placement,
        placement_strategy,
        notes
      )
      VALUES (
        v_submission_id,
        p_site_id,
        v_gasifier_template->>'gasifier_code',
        (v_gasifier_template->>'chemical_type')::chemical_type_enum,
        (v_gasifier_template->>'placement_height')::placement_height_enum,
        (v_gasifier_template->>'directional_placement')::directional_placement_enum,
        (v_gasifier_template->>'placement_strategy')::placement_strategy_enum,
        v_gasifier_template->>'notes'
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
COMMENT ON FUNCTION public.create_submission_session IS 'Creates a submission and session with optional petri and gasifier observations from templates. Supports split image petri templates with proper enum casting.';