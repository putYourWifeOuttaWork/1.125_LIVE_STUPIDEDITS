/*
  # Fix Site Creation by Removing num_openings Parameter
  
  1. Changes
    - Drops and recreates the create_site_without_history function
    - Removes the p_num_openings parameter from the function signature
    - Removes num_openings from the INSERT statement columns
    - Removes p_num_openings from the VALUES list
    
  2. Purpose
    - Resolves the "Failed to create site" error in the frontend
    - Aligns function signature with current sites table structure
    - Maintains backward compatibility with existing code
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS create_site_without_history(
  VARCHAR, site_type_enum, UUID, JSONB, JSONB, JSONB,
  NUMERIC, NUMERIC, INTEGER, INTEGER, vent_placement_enum[],
  primary_function_enum, construction_material_enum, insulation_type_enum,
  BOOLEAN, hvac_system_type_enum, irrigation_system_type_enum, lighting_system_enum,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, INTEGER
);

-- Create the updated function without p_num_openings parameter
CREATE OR REPLACE FUNCTION create_site_without_history(
  p_name VARCHAR(100),
  p_type site_type_enum,
  p_program_id UUID,
  p_submission_defaults JSONB DEFAULT NULL,
  p_petri_defaults JSONB DEFAULT NULL,
  p_gasifier_defaults JSONB DEFAULT NULL,
  -- Physical attributes
  p_square_footage NUMERIC DEFAULT NULL,
  p_cubic_footage NUMERIC DEFAULT NULL,
  p_num_vents INTEGER DEFAULT NULL,
  p_vent_placements vent_placement_enum[] DEFAULT NULL,
  -- Facility details
  p_primary_function primary_function_enum DEFAULT NULL,
  p_construction_material construction_material_enum DEFAULT NULL,
  p_insulation_type insulation_type_enum DEFAULT NULL,
  -- Environmental controls
  p_hvac_system_present BOOLEAN DEFAULT FALSE,
  p_hvac_system_type hvac_system_type_enum DEFAULT NULL,
  p_irrigation_system_type irrigation_system_type_enum DEFAULT NULL,
  p_lighting_system lighting_system_enum DEFAULT NULL,
  -- New dimensions and density fields
  p_length NUMERIC DEFAULT NULL,
  p_width NUMERIC DEFAULT NULL,
  p_height NUMERIC DEFAULT NULL,
  p_min_efficacious_gasifier_density_sqft_per_bag NUMERIC DEFAULT 2000,
  p_has_dead_zones BOOLEAN DEFAULT FALSE,
  p_num_regularly_opened_ports INTEGER DEFAULT NULL
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_site_id UUID;
  v_result JSONB;
  v_square_footage NUMERIC;
  v_cubic_footage NUMERIC;
  v_recommended_bags INTEGER;
BEGIN
  -- Calculate square footage, cubic footage, and recommended bags if dimensions are provided
  IF p_length IS NOT NULL AND p_width IS NOT NULL THEN
    v_square_footage := p_length * p_width;
    
    IF p_height IS NOT NULL THEN
      v_cubic_footage := v_square_footage * p_height;
    ELSE
      v_cubic_footage := p_cubic_footage; -- Use provided value or NULL
    END IF;
    
    IF p_min_efficacious_gasifier_density_sqft_per_bag > 0 THEN
      v_recommended_bags := CEILING(v_square_footage / p_min_efficacious_gasifier_density_sqft_per_bag);
    END IF;
  ELSE
    v_square_footage := p_square_footage; -- Use provided value or NULL
    v_cubic_footage := p_cubic_footage; -- Use provided value or NULL
    v_recommended_bags := NULL;
  END IF;

  -- Temporarily disable the trigger that logs site history
  ALTER TABLE sites DISABLE TRIGGER log_site_history_trigger;
  
  -- Insert the new site with all properties (removed num_openings)
  INSERT INTO sites (
    name, 
    type, 
    program_id, 
    submission_defaults, 
    petri_defaults,
    gasifier_defaults,
    -- Physical attributes
    square_footage,
    cubic_footage,
    num_vents,
    vent_placements,
    -- Facility details
    primary_function,
    construction_material,
    insulation_type,
    -- Environmental controls
    hvac_system_present,
    hvac_system_type,
    irrigation_system_type,
    lighting_system,
    -- New dimensions and density fields
    length,
    width,
    height,
    min_efficacious_gasifier_density_sqft_per_bag,
    recommended_placement_density_bags,
    has_dead_zones,
    num_regularly_opened_ports
  )
  VALUES (
    p_name, 
    p_type, 
    p_program_id, 
    p_submission_defaults, 
    p_petri_defaults,
    p_gasifier_defaults,
    -- Physical attributes
    v_square_footage,
    v_cubic_footage,
    p_num_vents,
    p_vent_placements,
    -- Facility details
    p_primary_function,
    p_construction_material,
    p_insulation_type,
    -- Environmental controls
    p_hvac_system_present,
    p_hvac_system_type,
    p_irrigation_system_type,
    p_lighting_system,
    -- New dimensions and density fields
    p_length,
    p_width,
    p_height,
    p_min_efficacious_gasifier_density_sqft_per_bag,
    v_recommended_bags,
    p_has_dead_zones,
    p_num_regularly_opened_ports
  )
  RETURNING site_id INTO v_site_id;
  
  -- Re-enable the trigger
  ALTER TABLE sites ENABLE TRIGGER log_site_history_trigger;
  
  -- Return the new site ID and calculated values
  v_result := jsonb_build_object(
    'site_id', v_site_id,
    'success', TRUE,
    'square_footage', v_square_footage,
    'cubic_footage', v_cubic_footage,
    'recommended_bags', v_recommended_bags
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

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_site_without_history(
  VARCHAR, site_type_enum, UUID, JSONB, JSONB, JSONB,
  NUMERIC, NUMERIC, INTEGER, vent_placement_enum[],
  primary_function_enum, construction_material_enum, insulation_type_enum,
  BOOLEAN, hvac_system_type_enum, irrigation_system_type_enum, lighting_system_enum,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, INTEGER
) TO authenticated;