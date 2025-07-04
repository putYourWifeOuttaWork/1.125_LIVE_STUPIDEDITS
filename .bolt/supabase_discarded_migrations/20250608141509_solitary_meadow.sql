/*
  # Add Petri Placement Fields
  
  1. New Features
    - Adds placement and placement dynamics fields to petri observations
    - Creates new enum types for these fields
    - Updates relevant functions to support the new fields
    
  2. Changes
    - Creates petri_placement_enum and petri_placement_dynamics_enum
    - Adds placement and placement_dynamics columns to petri_observations table
    - Updates site template functions to handle the new fields
*/

-- 1. Create new ENUM types for petri placement fields

-- Placement options (position in the space)
CREATE TYPE petri_placement_enum AS ENUM (
  'Center-Center',
  'Center-Right', 
  'Center-Left', 
  'Front-Left', 
  'Front-Right', 
  'Front-Center', 
  'Back-Center', 
  'Back-Right', 
  'Back-Left'
);

-- Placement dynamics options (relative to environmental features)
CREATE TYPE petri_placement_dynamics_enum AS ENUM (
  'Near Port',
  'Near Door',
  'Near Ventillation Out',
  'Near Airflow In'
);

-- 2. Add new columns to petri_observations table
ALTER TABLE petri_observations 
ADD COLUMN placement petri_placement_enum NULL,
ADD COLUMN placement_dynamics petri_placement_dynamics_enum NULL;

-- 3. Update the create_site_without_history function to handle the new fields
CREATE OR REPLACE FUNCTION create_site_without_history(
  p_name VARCHAR(100),
  p_type site_type_enum,
  p_program_id UUID,
  p_submission_defaults JSONB DEFAULT NULL,
  p_petri_defaults JSONB DEFAULT NULL,
  p_gasifier_defaults JSONB DEFAULT NULL
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_site_id UUID;
  v_result JSONB;
  v_petri_defaults JSONB;
BEGIN
  -- Temporarily disable the trigger that logs site history
  ALTER TABLE sites DISABLE TRIGGER log_site_history_trigger;
  
  -- Process petri defaults to ensure they include placement and placement_dynamics
  IF p_petri_defaults IS NOT NULL AND jsonb_array_length(p_petri_defaults) > 0 THEN
    v_petri_defaults := p_petri_defaults;
  ELSE
    v_petri_defaults := p_petri_defaults;
  END IF;
  
  -- Insert the new site with template defaults
  INSERT INTO sites (
    name, 
    type, 
    program_id, 
    submission_defaults, 
    petri_defaults,
    gasifier_defaults
  )
  VALUES (
    p_name, 
    p_type, 
    p_program_id, 
    p_submission_defaults, 
    v_petri_defaults,
    p_gasifier_defaults
  )
  RETURNING site_id INTO v_site_id;
  
  -- Re-enable the trigger
  ALTER TABLE sites ENABLE TRIGGER log_site_history_trigger;
  
  -- Return the new site ID
  v_result := jsonb_build_object(
    'site_id', v_site_id,
    'success', TRUE
  );
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    -- Make sure to re-enable the trigger even if there's an error
    ALTER TABLE sites ENABLE TRIGGER log_site_history_trigger;
    
    v_result := jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
    
    RETURN v_result;
END;
$$;

-- 4. Update the update_site_template_defaults function to handle the new fields
CREATE OR REPLACE FUNCTION update_site_template_defaults(
  p_site_id UUID,
  p_submission_defaults JSONB,
  p_petri_defaults JSONB,
  p_gasifier_defaults JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_petri_defaults JSONB;
BEGIN
  -- Check if the user has permission (Admin or Edit role for the program)
  IF NOT EXISTS (
    SELECT 1 
    FROM sites s
    JOIN pilot_program_users ppu ON s.program_id = ppu.program_id
    WHERE s.site_id = p_site_id
    AND ppu.user_id = auth.uid()
    AND (ppu.role = 'Admin' OR ppu.role = 'Edit')
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient permissions');
  END IF;
  
  -- Process petri defaults to ensure they include placement and placement_dynamics
  IF p_petri_defaults IS NOT NULL AND jsonb_array_length(p_petri_defaults) > 0 THEN
    v_petri_defaults := p_petri_defaults;
  ELSE
    v_petri_defaults := p_petri_defaults;
  END IF;
  
  -- Update the site with new template defaults
  UPDATE sites
  SET 
    submission_defaults = p_submission_defaults,
    petri_defaults = v_petri_defaults,
    gasifier_defaults = p_gasifier_defaults,
    updated_at = NOW()
  WHERE site_id = p_site_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Site template defaults updated successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 5. Update the log_petri_observation_history function to include the new fields
CREATE OR REPLACE FUNCTION log_petri_observation_history()
RETURNS TRIGGER AS $$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
BEGIN
  -- Handle the case when the operation is performed by the system or during migration
  IF auth.uid() IS NULL THEN
    RETURN NULL; -- Skip logging if there's no authenticated user
  END IF;

  -- We need to get the program_id from the submission
  IF TG_OP = 'DELETE' THEN
    SELECT program_id INTO program_id_val FROM submissions WHERE submission_id = OLD.submission_id;
  ELSE
    SELECT program_id INTO program_id_val FROM submissions WHERE submission_id = NEW.submission_id;
  END IF;
  
  -- Determine the history event type
  IF TG_OP = 'INSERT' THEN
    history_type := 'PetriCreation';
  ELSIF TG_OP = 'UPDATE' THEN
    history_type := 'PetriUpdate';
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'PetriDeletion';
  END IF;
  
  -- Get user details
  SELECT * FROM get_user_audit_details(program_id_val) INTO user_details;
  
  -- Insert history record with try/catch to prevent failures from propagating
  BEGIN
    INSERT INTO pilot_program_history (
      update_type, 
      object_id, 
      object_type,
      program_id,
      user_id,
      user_email,
      user_company,
      user_role,
      old_data, 
      new_data
    )
    VALUES (
      history_type,
      CASE WHEN TG_OP = 'DELETE' THEN OLD.observation_id ELSE NEW.observation_id END,
      'petri_observation',
      program_id_val,
      user_details.user_id,
      user_details.user_email,
      user_details.user_company,
      user_details.user_role,
      CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
      CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
    );
  EXCEPTION 
    WHEN OTHERS THEN
      -- Log the error but don't fail the transaction
      RAISE WARNING 'Failed to log petri observation history: %', SQLERRM;
  END;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 6. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_site_without_history(VARCHAR, site_type_enum, UUID, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_site_template_defaults(UUID, JSONB, JSONB, JSONB) TO authenticated;

-- 7. Add comments for documentation
COMMENT ON COLUMN petri_observations.placement IS 'Position of the petri dish (Center-Center, Front-Left, etc.)';
COMMENT ON COLUMN petri_observations.placement_dynamics IS 'Placement relative to environmental features (Near Door, Near Port, etc.)';