/*
  # Fix "cannot get array length of a scalar" error in create_submission_session
  
  1. Changes
    - Properly validate and handle JSONB arrays in create_submission_session function
    - Convert non-array or NULL inputs to empty arrays to prevent errors
    - Adds explicit checks before using jsonb_array_length
    
  2. Purpose
    - Fixes the error "cannot get array length of a scalar" when creating sessions
    - Ensures templates are properly validated before attempting to use them
    - Maintains backward compatibility with existing code
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS create_submission_session;

-- Create a safer version of the create_submission_session function
CREATE OR REPLACE FUNCTION create_submission_session(
  p_site_id UUID,
  p_program_id UUID,
  p_submission_data JSONB,
  p_petri_templates JSONB DEFAULT NULL,
  p_gasifier_templates JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_submission_id UUID;
  v_session_id UUID;
  v_petri_template JSONB;
  v_gasifier_template JSONB;
  v_petri_count INTEGER;
  v_gasifier_count INTEGER;
  v_site_timezone TEXT;
  v_result JSONB;
  v_petri_templates_array JSONB;
  v_gasifier_templates_array JSONB;
BEGIN
  -- Get site timezone if available
  SELECT timezone INTO v_site_timezone
  FROM sites
  WHERE site_id = p_site_id;
  
  -- Validate and standardize template inputs
  -- Ensure petri templates is a valid JSONB array or default to empty array
  IF p_petri_templates IS NULL OR jsonb_typeof(p_petri_templates) != 'array' THEN
    v_petri_templates_array := '[]'::JSONB;
  ELSE
    v_petri_templates_array := p_petri_templates;
  END IF;
  
  -- Ensure gasifier templates is a valid JSONB array or default to empty array
  IF p_gasifier_templates IS NULL OR jsonb_typeof(p_gasifier_templates) != 'array' THEN
    v_gasifier_templates_array := '[]'::JSONB;
  ELSE
    v_gasifier_templates_array := p_gasifier_templates;
  END IF;

  -- Create a new submission
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
    auth.uid(),
    (p_submission_data->>'indoor_temperature')::NUMERIC,
    (p_submission_data->>'indoor_humidity')::NUMERIC,
    COALESCE(p_submission_data->>'timezone', v_site_timezone)
  )
  RETURNING submission_id INTO v_submission_id;
  
  -- Create petri observations from templates
  IF jsonb_array_length(v_petri_templates_array) > 0 THEN
    v_petri_count := jsonb_array_length(v_petri_templates_array);
    
    FOR i IN 0..(v_petri_count-1) LOOP
      v_petri_template := v_petri_templates_array->i;
      
      INSERT INTO petri_observations (
        submission_id,
        site_id,
        petri_code,
        image_url,
        plant_type,
        fungicide_used,
        surrounding_water_schedule,
        placement,
        placement_dynamics,
        notes,
        lastupdated_by,
        last_updated_by_user_id
      )
      VALUES (
        v_submission_id,
        p_site_id,
        v_petri_template->>'petri_code',
        NULL, -- Image will be added later
        COALESCE(
          (v_petri_template->>'plant_type')::plant_type_enum, 
          'Other Fresh Perishable'::plant_type_enum
        ),
        (v_petri_template->>'fungicide_used')::fungicide_used_enum,
        (v_petri_template->>'surrounding_water_schedule')::water_schedule_enum,
        (v_petri_template->>'placement')::petri_placement_enum,
        (v_petri_template->>'placement_dynamics')::petri_placement_dynamics_enum,
        v_petri_template->>'notes',
        auth.uid(),
        auth.uid()
      );
    END LOOP;
  END IF;
  
  -- Create gasifier observations from templates
  IF jsonb_array_length(v_gasifier_templates_array) > 0 THEN
    v_gasifier_count := jsonb_array_length(v_gasifier_templates_array);
    
    FOR i IN 0..(v_gasifier_count-1) LOOP
      v_gasifier_template := v_gasifier_templates_array->i;
      
      INSERT INTO gasifier_observations (
        submission_id,
        site_id,
        gasifier_code,
        image_url,
        chemical_type,
        measure,
        anomaly,
        placement_height,
        directional_placement,
        placement_strategy,
        notes,
        lastupdated_by,
        last_updated_by_user_id
      )
      VALUES (
        v_submission_id,
        p_site_id,
        v_gasifier_template->>'gasifier_code',
        NULL, -- Image will be added later
        (v_gasifier_template->>'chemical_type')::chemical_type_enum,
        (v_gasifier_template->>'measure')::NUMERIC,
        COALESCE((v_gasifier_template->>'anomaly')::BOOLEAN, FALSE),
        (v_gasifier_template->>'placement_height')::placement_height_enum,
        (v_gasifier_template->>'directional_placement')::directional_placement_enum,
        (v_gasifier_template->>'placement_strategy')::placement_strategy_enum,
        v_gasifier_template->>'notes',
        auth.uid(),
        auth.uid()
      );
    END LOOP;
  END IF;
  
  -- Create the submission session
  INSERT INTO submission_sessions (
    submission_id,
    site_id,
    program_id,
    opened_by_user_id
  )
  VALUES (
    v_submission_id,
    p_site_id,
    p_program_id,
    auth.uid()
  )
  RETURNING session_id INTO v_session_id;
  
  -- Update the session activity to calculate percentage complete
  v_result := update_submission_session_activity(v_session_id);
  
  -- Return both the submission and session IDs
  RETURN jsonb_build_object(
    'success', TRUE,
    'submission_id', v_submission_id,
    'session_id', v_session_id,
    'session', v_result
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Clean up on failure
    IF v_submission_id IS NOT NULL THEN
      -- This will cascade to delete related observations
      DELETE FROM submissions WHERE submission_id = v_submission_id;
    END IF;
    
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_submission_session(UUID, UUID, JSONB, JSONB, JSONB) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION create_submission_session IS 'Creates a new submission session with the provided data. Fixed to handle NULL or non-array template inputs safely.';