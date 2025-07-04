/*
  # Selective Field Updates for Gasifier Observations

  1. New Features
    - Modify the updateGasifierObservations process to avoid overwriting fields that haven't changed
    - Preserve static fields like coordinates and order_index
    - Add new function to selectively update observations
    
  2. Purpose
    - Fix issue where template fields are being overwritten during updates
    - Preserve position data and ordering information
*/

-- Create a new function that only updates the fields that have changed for gasifier observations
CREATE OR REPLACE FUNCTION selective_update_gasifier_observation(
  p_observation_id UUID,
  p_updates JSONB
) RETURNS JSONB AS $$
DECLARE
  existing_record RECORD;
  update_columns TEXT := '';
  update_values TEXT := '';
  updated_record JSONB;
  current_user_id UUID;
BEGIN
  -- Get the current user ID for last_updated_by tracking
  current_user_id := auth.uid();
  
  -- Get the existing record first
  SELECT * INTO existing_record 
  FROM gasifier_observations 
  WHERE observation_id = p_observation_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Gasifier observation not found'
    );
  END IF;
  
  -- Always update last_updated_by_user_id and last_edit_time
  update_columns := 'last_updated_by_user_id = $1, last_edit_time = now()';
  update_values := current_user_id::TEXT;
  
  -- Check each field in the update payload and only include it if it's different
  -- Gasifier code
  IF p_updates ? 'gasifier_code' AND (p_updates ->> 'gasifier_code') IS DISTINCT FROM existing_record.gasifier_code THEN
    update_columns := update_columns || ', gasifier_code = $2';
    update_values := update_values || ', ' || quote_literal(p_updates ->> 'gasifier_code');
  END IF;
  
  -- Image URL - only update if provided and different
  IF p_updates ? 'image_url' AND (p_updates ->> 'image_url') IS DISTINCT FROM existing_record.image_url THEN
    update_columns := update_columns || ', image_url = $3';
    update_values := update_values || ', ' || COALESCE(quote_literal(p_updates ->> 'image_url'), 'NULL');
  END IF;
  
  -- Chemical type
  IF p_updates ? 'chemical_type' AND (p_updates ->> 'chemical_type') IS DISTINCT FROM existing_record.chemical_type::TEXT THEN
    update_columns := update_columns || ', chemical_type = $4';
    update_values := update_values || ', ' || quote_literal(p_updates ->> 'chemical_type') || '::chemical_type_enum';
  END IF;
  
  -- Measure
  IF p_updates ? 'measure' AND (p_updates ->> 'measure')::NUMERIC IS DISTINCT FROM existing_record.measure THEN
    update_columns := update_columns || ', measure = $5';
    update_values := update_values || ', ' || COALESCE((p_updates ->> 'measure'), 'NULL');
  END IF;
  
  -- Anomaly
  IF p_updates ? 'anomaly' AND (p_updates ->> 'anomaly')::BOOLEAN IS DISTINCT FROM existing_record.anomaly THEN
    update_columns := update_columns || ', anomaly = $6';
    update_values := update_values || ', ' || COALESCE((p_updates ->> 'anomaly')::TEXT, 'false');
  END IF;
  
  -- Placement height
  IF p_updates ? 'placement_height' AND (p_updates ->> 'placement_height') IS DISTINCT FROM existing_record.placement_height::TEXT THEN
    update_columns := update_columns || ', placement_height = $7';
    IF p_updates ->> 'placement_height' IS NULL OR (p_updates ->> 'placement_height') = '' THEN
      update_values := update_values || ', NULL';
    ELSE
      update_values := update_values || ', ' || quote_literal(p_updates ->> 'placement_height') || '::placement_height_enum';
    END IF;
  END IF;
  
  -- Directional placement
  IF p_updates ? 'directional_placement' AND (p_updates ->> 'directional_placement') IS DISTINCT FROM existing_record.directional_placement::TEXT THEN
    update_columns := update_columns || ', directional_placement = $8';
    IF p_updates ->> 'directional_placement' IS NULL OR (p_updates ->> 'directional_placement') = '' THEN
      update_values := update_values || ', NULL';
    ELSE
      update_values := update_values || ', ' || quote_literal(p_updates ->> 'directional_placement') || '::directional_placement_enum';
    END IF;
  END IF;
  
  -- Placement strategy
  IF p_updates ? 'placement_strategy' AND (p_updates ->> 'placement_strategy') IS DISTINCT FROM existing_record.placement_strategy::TEXT THEN
    update_columns := update_columns || ', placement_strategy = $9';
    IF p_updates ->> 'placement_strategy' IS NULL OR (p_updates ->> 'placement_strategy') = '' THEN
      update_values := update_values || ', NULL';
    ELSE
      update_values := update_values || ', ' || quote_literal(p_updates ->> 'placement_strategy') || '::placement_strategy_enum';
    END IF;
  END IF;
  
  -- Notes
  IF p_updates ? 'notes' AND (p_updates ->> 'notes') IS DISTINCT FROM existing_record.notes THEN
    update_columns := update_columns || ', notes = $10';
    update_values := update_values || ', ' || COALESCE(quote_literal(p_updates ->> 'notes'), 'NULL');
  END IF;
  
  -- Environmental data
  -- Outdoor temperature
  IF p_updates ? 'outdoor_temperature' AND (p_updates ->> 'outdoor_temperature')::NUMERIC IS DISTINCT FROM existing_record.outdoor_temperature THEN
    update_columns := update_columns || ', outdoor_temperature = $11';
    update_values := update_values || ', ' || COALESCE((p_updates ->> 'outdoor_temperature'), 'NULL');
  END IF;
  
  -- Outdoor humidity
  IF p_updates ? 'outdoor_humidity' AND (p_updates ->> 'outdoor_humidity')::NUMERIC IS DISTINCT FROM existing_record.outdoor_humidity THEN
    update_columns := update_columns || ', outdoor_humidity = $12';
    update_values := update_values || ', ' || COALESCE((p_updates ->> 'outdoor_humidity'), 'NULL');
  END IF;
  
  -- If only last_updated_by and last_edit_time would be updated, skip the update
  IF update_columns = 'last_updated_by_user_id = $1, last_edit_time = now()' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'No changes detected',
      'observation_id', p_observation_id
    );
  END IF;
  
  -- Construct the dynamic SQL
  EXECUTE 'UPDATE gasifier_observations SET ' || update_columns || 
          ' WHERE observation_id = $13 RETURNING to_jsonb(gasifier_observations.*)'
  INTO updated_record
  USING 
    current_user_id,
    p_updates ->> 'gasifier_code',
    p_updates ->> 'image_url',
    p_updates ->> 'chemical_type',
    (p_updates ->> 'measure')::NUMERIC,
    (p_updates ->> 'anomaly')::BOOLEAN,
    p_updates ->> 'placement_height',
    p_updates ->> 'directional_placement',
    p_updates ->> 'placement_strategy',
    p_updates ->> 'notes',
    (p_updates ->> 'outdoor_temperature')::NUMERIC,
    (p_updates ->> 'outdoor_humidity')::NUMERIC,
    p_observation_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Gasifier observation updated successfully',
    'observation_id', p_observation_id,
    'observation', updated_record
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Error updating gasifier observation: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a similar function for petri observations
CREATE OR REPLACE FUNCTION selective_update_petri_observation(
  p_observation_id UUID,
  p_updates JSONB
) RETURNS JSONB AS $$
DECLARE
  existing_record RECORD;
  update_columns TEXT := '';
  update_values TEXT := '';
  updated_record JSONB;
  current_user_id UUID;
BEGIN
  -- Get the current user ID for last_updated_by tracking
  current_user_id := auth.uid();
  
  -- Get the existing record first
  SELECT * INTO existing_record 
  FROM petri_observations 
  WHERE observation_id = p_observation_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Petri observation not found'
    );
  END IF;
  
  -- Always update last_updated_by_user_id and last_edit_time
  update_columns := 'last_updated_by_user_id = $1, last_edit_time = now()';
  update_values := current_user_id::TEXT;
  
  -- Check each field in the update payload and only include it if it's different
  -- Petri code
  IF p_updates ? 'petri_code' AND (p_updates ->> 'petri_code') IS DISTINCT FROM existing_record.petri_code THEN
    update_columns := update_columns || ', petri_code = $2';
    update_values := update_values || ', ' || quote_literal(p_updates ->> 'petri_code');
  END IF;
  
  -- Image URL - only update if provided and different
  IF p_updates ? 'image_url' AND (p_updates ->> 'image_url') IS DISTINCT FROM existing_record.image_url THEN
    update_columns := update_columns || ', image_url = $3';
    update_values := update_values || ', ' || COALESCE(quote_literal(p_updates ->> 'image_url'), 'NULL');
  END IF;
  
  -- Fungicide used
  IF p_updates ? 'fungicide_used' AND (p_updates ->> 'fungicide_used') IS DISTINCT FROM existing_record.fungicide_used::TEXT THEN
    update_columns := update_columns || ', fungicide_used = $4';
    update_values := update_values || ', ' || quote_literal(p_updates ->> 'fungicide_used') || '::fungicide_used_enum';
  END IF;
  
  -- Surrounding water schedule
  IF p_updates ? 'surrounding_water_schedule' AND (p_updates ->> 'surrounding_water_schedule') IS DISTINCT FROM existing_record.surrounding_water_schedule::TEXT THEN
    update_columns := update_columns || ', surrounding_water_schedule = $5';
    update_values := update_values || ', ' || quote_literal(p_updates ->> 'surrounding_water_schedule') || '::water_schedule_enum';
  END IF;
  
  -- Plant type
  IF p_updates ? 'plant_type' AND (p_updates ->> 'plant_type') IS DISTINCT FROM existing_record.plant_type::TEXT THEN
    update_columns := update_columns || ', plant_type = $6';
    update_values := update_values || ', ' || quote_literal(p_updates ->> 'plant_type') || '::plant_type_enum';
  END IF;
  
  -- Placement
  IF p_updates ? 'placement' AND (p_updates ->> 'placement') IS DISTINCT FROM existing_record.placement::TEXT THEN
    update_columns := update_columns || ', placement = $7';
    IF p_updates ->> 'placement' IS NULL OR (p_updates ->> 'placement') = '' THEN
      update_values := update_values || ', NULL';
    ELSE
      update_values := update_values || ', ' || quote_literal(p_updates ->> 'placement') || '::petri_placement_enum';
    END IF;
  END IF;
  
  -- Placement dynamics
  IF p_updates ? 'placement_dynamics' AND (p_updates ->> 'placement_dynamics') IS DISTINCT FROM existing_record.placement_dynamics::TEXT THEN
    update_columns := update_columns || ', placement_dynamics = $8';
    IF p_updates ->> 'placement_dynamics' IS NULL OR (p_updates ->> 'placement_dynamics') = '' THEN
      update_values := update_values || ', NULL';
    ELSE
      update_values := update_values || ', ' || quote_literal(p_updates ->> 'placement_dynamics') || '::petri_placement_dynamics_enum';
    END IF;
  END IF;
  
  -- Notes
  IF p_updates ? 'notes' AND (p_updates ->> 'notes') IS DISTINCT FROM existing_record.notes THEN
    update_columns := update_columns || ', notes = $9';
    update_values := update_values || ', ' || COALESCE(quote_literal(p_updates ->> 'notes'), 'NULL');
  END IF;
  
  -- Environmental data
  -- Outdoor temperature
  IF p_updates ? 'outdoor_temperature' AND (p_updates ->> 'outdoor_temperature')::NUMERIC IS DISTINCT FROM existing_record.outdoor_temperature THEN
    update_columns := update_columns || ', outdoor_temperature = $10';
    update_values := update_values || ', ' || COALESCE((p_updates ->> 'outdoor_temperature'), 'NULL');
  END IF;
  
  -- Outdoor humidity
  IF p_updates ? 'outdoor_humidity' AND (p_updates ->> 'outdoor_humidity')::NUMERIC IS DISTINCT FROM existing_record.outdoor_humidity THEN
    update_columns := update_columns || ', outdoor_humidity = $11';
    update_values := update_values || ', ' || COALESCE((p_updates ->> 'outdoor_humidity'), 'NULL');
  END IF;
  
  -- Growth data
  -- Petri growth stage
  IF p_updates ? 'petri_growth_stage' AND (p_updates ->> 'petri_growth_stage') IS DISTINCT FROM existing_record.petri_growth_stage::TEXT THEN
    update_columns := update_columns || ', petri_growth_stage = $12';
    IF p_updates ->> 'petri_growth_stage' IS NULL OR (p_updates ->> 'petri_growth_stage') = '' THEN
      update_values := update_values || ', NULL';
    ELSE
      update_values := update_values || ', ' || quote_literal(p_updates ->> 'petri_growth_stage') || '::petri_growth_stage';
    END IF;
  END IF;
  
  -- Growth index
  IF p_updates ? 'growth_index' AND (p_updates ->> 'growth_index')::NUMERIC IS DISTINCT FROM existing_record.growth_index THEN
    update_columns := update_columns || ', growth_index = $13';
    update_values := update_values || ', ' || COALESCE((p_updates ->> 'growth_index'), 'NULL');
  END IF;
  
  -- If only last_updated_by and last_edit_time would be updated, skip the update
  IF update_columns = 'last_updated_by_user_id = $1, last_edit_time = now()' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'No changes detected',
      'observation_id', p_observation_id
    );
  END IF;
  
  -- Construct the dynamic SQL
  EXECUTE 'UPDATE petri_observations SET ' || update_columns || 
          ' WHERE observation_id = $14 RETURNING to_jsonb(petri_observations.*)'
  INTO updated_record
  USING 
    current_user_id,
    p_updates ->> 'petri_code',
    p_updates ->> 'image_url',
    p_updates ->> 'fungicide_used',
    p_updates ->> 'surrounding_water_schedule',
    p_updates ->> 'plant_type',
    p_updates ->> 'placement',
    p_updates ->> 'placement_dynamics',
    p_updates ->> 'notes',
    (p_updates ->> 'outdoor_temperature')::NUMERIC,
    (p_updates ->> 'outdoor_humidity')::NUMERIC,
    p_updates ->> 'petri_growth_stage',
    (p_updates ->> 'growth_index')::NUMERIC,
    p_observation_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Petri observation updated successfully',
    'observation_id', p_observation_id,
    'observation', updated_record
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Error updating petri observation: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create an RPC function wrapper for the selective update of gasifier observations
CREATE OR REPLACE FUNCTION update_gasifier_observation_rpc(
  p_observation_id UUID,
  p_updates JSONB
) RETURNS JSONB AS $$
BEGIN
  -- Check if the user has permission to update this observation
  IF NOT EXISTS (
    SELECT 1 
    FROM gasifier_observations go
    JOIN submissions s ON go.submission_id = s.submission_id
    JOIN sites site ON s.site_id = site.site_id
    JOIN pilot_program_users ppu ON site.program_id = ppu.program_id
    WHERE go.observation_id = p_observation_id
    AND ppu.user_id = auth.uid()
    AND (ppu.role = 'Admin' OR ppu.role = 'Edit')
  ) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'You do not have permission to update this observation'
    );
  END IF;
  
  -- Call the selective update function
  RETURN selective_update_gasifier_observation(p_observation_id, p_updates);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create an RPC function wrapper for the selective update of petri observations
CREATE OR REPLACE FUNCTION update_petri_observation_rpc(
  p_observation_id UUID,
  p_updates JSONB
) RETURNS JSONB AS $$
BEGIN
  -- Check if the user has permission to update this observation
  IF NOT EXISTS (
    SELECT 1 
    FROM petri_observations po
    JOIN submissions s ON po.submission_id = s.submission_id
    JOIN sites site ON s.site_id = site.site_id
    JOIN pilot_program_users ppu ON site.program_id = ppu.program_id
    WHERE po.observation_id = p_observation_id
    AND ppu.user_id = auth.uid()
    AND (ppu.role = 'Admin' OR ppu.role = 'Edit')
  ) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'You do not have permission to update this observation'
    );
  END IF;
  
  -- Call the selective update function
  RETURN selective_update_petri_observation(p_observation_id, p_updates);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on the functions
GRANT EXECUTE ON FUNCTION selective_update_gasifier_observation(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION selective_update_petri_observation(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_gasifier_observation_rpc(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_petri_observation_rpc(UUID, JSONB) TO authenticated;

-- Add comments to document the functions
COMMENT ON FUNCTION selective_update_gasifier_observation IS 
  'Updates only the changed fields in a gasifier observation, preserving static fields like coordinates and order_index';
COMMENT ON FUNCTION selective_update_petri_observation IS 
  'Updates only the changed fields in a petri observation, preserving static fields';
COMMENT ON FUNCTION update_gasifier_observation_rpc IS 
  'RPC wrapper for selective_update_gasifier_observation with permission checks';
COMMENT ON FUNCTION update_petri_observation_rpc IS 
  'RPC wrapper for selective_update_petri_observation with permission checks';