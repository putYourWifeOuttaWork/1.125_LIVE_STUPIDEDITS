/*
  # Fix Session Status Logic and Conditional Form Generation
  
  1. Changes
    - Updates create_submission_session to set initial status to 'Working' when templates are used
    - Modifies update_submission_session_activity to only transition from 'Opened' to 'Working'
      when observations with data exist
    - Updates share_submission_session to only set 'Escalated' status when sharing with company admins
    - Adds session_status transition rules to maintain proper workflow
    
  2. Purpose
    - Prevents duplicate observation forms when returning to an active session
    - Establishes clear session status progression: Opened → Working → Escalated → Completed/Expired
    - Ensures 'Escalated' status is only set when appropriate (shared with admin)
*/

-- 1. Update create_submission_session to set initial status based on templates
CREATE OR REPLACE FUNCTION create_submission_session(
  p_site_id UUID,
  p_program_id UUID,
  p_submission_data JSONB,
  p_petri_templates TEXT DEFAULT NULL,
  p_gasifier_templates TEXT DEFAULT NULL
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
  v_petri_count INTEGER := 0;
  v_gasifier_count INTEGER := 0;
  v_site_timezone TEXT;
  v_result JSONB;
  v_petri_templates_array JSONB;
  v_gasifier_templates_array JSONB;
  v_error TEXT;
  v_initial_status session_status_enum;
BEGIN
  -- Get site timezone if available
  SELECT timezone INTO v_site_timezone
  FROM sites
  WHERE site_id = p_site_id;
  
  -- Convert text parameters to JSONB if they're not NULL
  BEGIN
    IF p_petri_templates IS NOT NULL THEN
      v_petri_templates_array := p_petri_templates::JSONB;
      -- Validate it's an array
      IF jsonb_typeof(v_petri_templates_array) != 'array' THEN
        v_petri_templates_array := '[]'::JSONB;
      END IF;
    ELSE
      v_petri_templates_array := '[]'::JSONB;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_petri_templates_array := '[]'::JSONB;
  END;
  
  BEGIN
    IF p_gasifier_templates IS NOT NULL THEN
      v_gasifier_templates_array := p_gasifier_templates::JSONB;
      -- Validate it's an array
      IF jsonb_typeof(v_gasifier_templates_array) != 'array' THEN
        v_gasifier_templates_array := '[]'::JSONB;
      END IF;
    ELSE
      v_gasifier_templates_array := '[]'::JSONB;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_gasifier_templates_array := '[]'::JSONB;
  END;

  -- For debugging
  RAISE NOTICE 'Petri templates count: %', jsonb_array_length(v_petri_templates_array);
  RAISE NOTICE 'Gasifier templates count: %', jsonb_array_length(v_gasifier_templates_array);
  
  -- Determine initial status based on templates
  -- If templates are being used, set to 'Working' immediately
  IF jsonb_array_length(v_petri_templates_array) > 0 OR jsonb_array_length(v_gasifier_templates_array) > 0 THEN
    v_initial_status := 'Working';
  ELSE
    v_initial_status := 'Opened';
  END IF;
  
  -- Start a transaction so we can roll back if anything fails
  BEGIN
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
        
        -- Insert petri observation with explicitly NULL image_url
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
          NULL, -- Explicitly NULL image_url
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
        
        -- Insert gasifier observation with explicitly NULL image_url and safe casting for measure
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
          NULL, -- Explicitly NULL image_url
          (v_gasifier_template->>'chemical_type')::chemical_type_enum,
          CASE 
            WHEN v_gasifier_template->>'measure' IS NULL OR v_gasifier_template->>'measure' = '' 
            THEN NULL 
            ELSE (v_gasifier_template->>'measure')::NUMERIC 
          END,
          COALESCE((v_gasifier_template->>'anomaly')::BOOLEAN, FALSE),
          CASE
            WHEN v_gasifier_template->>'placement_height' IS NULL OR v_gasifier_template->>'placement_height' = ''
            THEN NULL
            ELSE (v_gasifier_template->>'placement_height')::placement_height_enum
          END,
          CASE
            WHEN v_gasifier_template->>'directional_placement' IS NULL OR v_gasifier_template->>'directional_placement' = ''
            THEN NULL
            ELSE (v_gasifier_template->>'directional_placement')::directional_placement_enum
          END,
          CASE
            WHEN v_gasifier_template->>'placement_strategy' IS NULL OR v_gasifier_template->>'placement_strategy' = ''
            THEN NULL
            ELSE (v_gasifier_template->>'placement_strategy')::placement_strategy_enum
          END,
          v_gasifier_template->>'notes',
          auth.uid(),
          auth.uid()
        );
        
      END LOOP;
    END IF;
    
    -- Create the submission session with the determined initial status
    INSERT INTO submission_sessions (
      submission_id,
      site_id,
      program_id,
      opened_by_user_id,
      session_status -- Set the initial status based on templates
    )
    VALUES (
      v_submission_id,
      p_site_id,
      p_program_id,
      auth.uid(),
      v_initial_status
    )
    RETURNING session_id INTO v_session_id;
    
    -- Update the session activity to calculate percentage complete
    v_result := update_submission_session_activity(v_session_id);
    
    -- Return both the submission and session IDs
    RETURN jsonb_build_object(
      'success', TRUE,
      'submission_id', v_submission_id,
      'session_id', v_session_id,
      'session', v_result,
      'petri_count', v_petri_count,
      'gasifier_count', v_gasifier_count
    );
    
  EXCEPTION WHEN OTHERS THEN
    -- Get error details
    GET STACKED DIAGNOSTICS v_error = PG_EXCEPTION_DETAIL;
    
    -- Rollback by deleting the submission (will cascade to delete related records)
    IF v_submission_id IS NOT NULL THEN
      DELETE FROM submissions WHERE submission_id = v_submission_id;
    END IF;
    
    -- Return detailed error
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM,
      'detail', v_error
    );
  END;
END;
$$;

-- 2. Update update_submission_session_activity to only transition from 'Opened' to 'Working' when observations exist
CREATE OR REPLACE FUNCTION update_submission_session_activity(
  p_session_id UUID,
  p_last_activity_time TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_percentage_complete NUMERIC(5,2);
  v_valid_petris INTEGER;
  v_valid_gasifiers INTEGER;
  v_current_status session_status_enum;
  v_result JSONB;
BEGIN
  -- Calculate the current percentage complete
  v_percentage_complete := calculate_session_percentage_complete(p_session_id);
  
  -- Get current counts and status
  SELECT 
    valid_petris_logged, 
    valid_gasifiers_logged,
    session_status
  INTO 
    v_valid_petris, 
    v_valid_gasifiers,
    v_current_status
  FROM submission_sessions
  WHERE session_id = p_session_id;
  
  -- Update the session
  UPDATE submission_sessions
  SET 
    last_activity_time = p_last_activity_time,
    percentage_complete = v_percentage_complete,
    -- Only transition from 'Opened' to 'Working' if there are valid observations
    -- or if the status is already something other than 'Opened'
    session_status = CASE 
      WHEN v_current_status = 'Opened' AND (v_valid_petris > 0 OR v_valid_gasifiers > 0) 
        THEN 'Working'::session_status_enum
      ELSE v_current_status
    END
  WHERE session_id = p_session_id
  RETURNING to_jsonb(submission_sessions.*) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- 3. Update share_submission_session to only set 'Escalated' status when sharing with company admins
CREATE OR REPLACE FUNCTION share_submission_session(
  p_session_id UUID,
  p_user_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_submission_id UUID;
  v_opened_by_user_id UUID;
  v_current_status session_status_enum;
  v_current_escalated_ids UUID[];
  v_updated_escalated_ids UUID[];
  v_has_company_admin BOOLEAN := FALSE;
BEGIN
  -- Get session details
  SELECT 
    submission_id, 
    opened_by_user_id,
    session_status,
    escalated_to_user_ids
  INTO 
    v_submission_id, 
    v_opened_by_user_id,
    v_current_status,
    v_current_escalated_ids
  FROM submission_sessions
  WHERE session_id = p_session_id;
  
  -- Check if session exists
  IF v_submission_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Session not found');
  END IF;
  
  -- Check if session can be shared (not Cancelled or Expired)
  IF v_current_status IN ('Cancelled', 'Expired') THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Session cannot be shared: ' || v_current_status);
  END IF;
  
  -- Verify user permissions (must be opened_by_user_id or in escalated_to_user_ids)
  IF v_opened_by_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM submission_sessions
    WHERE session_id = p_session_id
    AND escalated_to_user_ids @> ARRAY[auth.uid()]
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'You do not have permission to share this session');
  END IF;
  
  -- Check if any of the users being shared with are company admins
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = ANY(p_user_ids)
    AND is_company_admin = TRUE
  ) INTO v_has_company_admin;
  
  -- Create updated escalated_to_user_ids array (combine existing and new, remove duplicates)
  IF v_current_escalated_ids IS NULL THEN
    v_updated_escalated_ids := p_user_ids;
  ELSE
    -- Combine existing and new user IDs, removing duplicates
    WITH combined_ids AS (
      SELECT DISTINCT unnest(v_current_escalated_ids || p_user_ids) AS user_id
    )
    SELECT array_agg(user_id) INTO v_updated_escalated_ids
    FROM combined_ids;
  END IF;
  
  -- Update session
  UPDATE submission_sessions
  SET 
    escalated_to_user_ids = v_updated_escalated_ids,
    -- Only set to 'Escalated' if sharing with a company admin
    -- Otherwise maintain current status
    session_status = CASE 
      -- If sharing with company admin and status is 'Opened' or 'Working', set to 'Escalated'
      WHEN v_has_company_admin = TRUE AND v_current_status IN ('Opened', 'Working') 
        THEN 'Escalated'::session_status_enum
      -- If already 'Escalated', 'Completed', 'Cancelled', or 'Expired', maintain current status
      ELSE v_current_status
    END,
    last_activity_time = now()
  WHERE session_id = p_session_id
  RETURNING to_jsonb(submission_sessions.*) INTO v_result;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Session shared successfully',
    'session', v_result
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$;

-- 4. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_submission_session(UUID, UUID, JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_submission_session_activity(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION share_submission_session(UUID, UUID[]) TO authenticated;

-- 5. Add comments for documentation
COMMENT ON FUNCTION create_submission_session IS 'Creates a new submission with associated petri and gasifier observations from templates. Sets initial status to Working if templates are used.';
COMMENT ON FUNCTION update_submission_session_activity IS 'Updates session activity timestamp and percentage complete. Only transitions from Opened to Working if valid observations exist.';
COMMENT ON FUNCTION share_submission_session IS 'Shares a submission session with other users. Only sets status to Escalated if sharing with a company admin.';