/*
  # Fix create_site_without_history Function Overloading Issue
  
  1. Changes
    - Drop ALL versions of the function regardless of parameter signatures
    - Create a single clean version with consistent parameter types
    - Ensure proper enum type casting
    
  2. Purpose
    - Resolve "function name is not unique" errors
    - Fix ambiguity in function resolution
    - Establish a single canonical version of the function
*/

-- STEP 1: Drop ALL versions of the function regardless of parameters
DO $$ 
BEGIN
  -- This approach drops ALL versions of a function with the given name
  -- regardless of their parameter signatures
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'create_site_without_history' 
    AND pg_function_is_visible(oid)
  ) THEN
    EXECUTE 'DROP FUNCTION create_site_without_history CASCADE';
  END IF;
END $$;

-- STEP 2: Create a single clean version of the function
CREATE FUNCTION public.create_site_without_history(
  p_name text,
  p_type public.site_type_enum,
  p_program_id uuid,
  p_submission_defaults jsonb DEFAULT NULL,
  p_petri_defaults jsonb DEFAULT NULL,
  p_gasifier_defaults jsonb DEFAULT NULL,
  p_square_footage numeric DEFAULT NULL,
  p_cubic_footage numeric DEFAULT NULL,
  p_num_vents integer DEFAULT NULL,
  p_vent_placements public.vent_placement_enum[] DEFAULT NULL,
  p_primary_function public.primary_function_enum DEFAULT NULL,
  p_construction_material public.construction_material_enum DEFAULT NULL,
  p_insulation_type public.insulation_type_enum DEFAULT NULL,
  p_hvac_system_present boolean DEFAULT NULL,
  p_hvac_system_type public.hvac_system_type_enum DEFAULT NULL,
  p_irrigation_system_type public.irrigation_system_type_enum DEFAULT NULL,
  p_lighting_system public.lighting_system_enum DEFAULT NULL,
  p_length numeric DEFAULT NULL,
  p_width numeric DEFAULT NULL,
  p_height numeric DEFAULT NULL,
  p_min_efficacious_gasifier_density_sqft_per_bag numeric DEFAULT 2000,
  p_has_dead_zones boolean DEFAULT false,
  p_num_regularly_opened_ports integer DEFAULT NULL,
  p_interior_working_surface_types public.interior_working_surface_type_enum[] DEFAULT NULL,
  p_microbial_risk_zone public.microbial_risk_zone_enum DEFAULT 'Medium'::public.microbial_risk_zone_enum,
  p_quantity_deadzones integer DEFAULT NULL,
  p_ventilation_strategy public.ventilation_strategy_enum DEFAULT NULL
) 
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_site_id UUID;
  v_site_code BIGINT;
  v_program_name TEXT;
  v_current_user_id UUID;
  v_result JSONB;
BEGIN
  -- Get the current user ID
  v_current_user_id := auth.uid();
  
  -- Verify program exists and get program name
  SELECT name INTO v_program_name FROM pilot_programs WHERE program_id = p_program_id;
  
  IF v_program_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Program not found'
    );
  END IF;
  
  -- Verify user has access to program with appropriate role
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users 
    WHERE program_id = p_program_id 
    AND user_id = v_current_user_id 
    AND role IN ('Admin', 'Edit')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You do not have permission to create sites in this program'
    );
  END IF;
  
  -- Generate site code for this site
  SELECT COALESCE(MAX(site_code), 1000000) + 1 INTO v_site_code FROM sites;
  
  -- Create the site record
  INSERT INTO sites (
    program_id,
    name,
    type,
    program_name,
    site_code,
    -- Facility Characteristics
    square_footage,
    cubic_footage,
    num_vents,
    vent_placements,
    primary_function,
    construction_material,
    insulation_type,
    hvac_system_present,
    hvac_system_type,
    irrigation_system_type,
    lighting_system,
    length,
    width,
    height,
    min_efficacious_gasifier_density_sqft_per_bag,
    has_dead_zones,
    num_regularly_opened_ports,
    interior_working_surface_types,
    microbial_risk_zone,
    quantity_deadzones,
    ventilation_strategy,
    -- Template data
    submission_defaults,
    petri_defaults,
    gasifier_defaults,
    -- Metadata
    lastupdated_by
  )
  VALUES (
    p_program_id,
    p_name,
    p_type,
    v_program_name,
    v_site_code,
    -- Facility Characteristics
    p_square_footage,
    p_cubic_footage,
    p_num_vents,
    p_vent_placements,
    p_primary_function,
    p_construction_material,
    p_insulation_type,
    p_hvac_system_present,
    p_hvac_system_type,
    p_irrigation_system_type,
    p_lighting_system,
    p_length,
    p_width,
    p_height,
    p_min_efficacious_gasifier_density_sqft_per_bag,
    p_has_dead_zones,
    p_num_regularly_opened_ports,
    p_interior_working_surface_types,
    p_microbial_risk_zone,
    p_quantity_deadzones,
    p_ventilation_strategy,
    -- Template data
    p_submission_defaults,
    p_petri_defaults,
    p_gasifier_defaults,
    -- Metadata
    v_current_user_id
  )
  RETURNING site_id INTO v_site_id;
  
  -- Calculate recommended gasifier placement if we have dimensions
  IF p_length IS NOT NULL AND p_width IS NOT NULL AND p_min_efficacious_gasifier_density_sqft_per_bag IS NOT NULL THEN
    -- Calculate square footage based on length and width
    UPDATE sites
    SET 
      square_footage = p_length * p_width,
      recommended_placement_density_bags = CEILING((p_length * p_width) / p_min_efficacious_gasifier_density_sqft_per_bag)
    WHERE site_id = v_site_id;
  END IF;
  
  -- Calculate cubic footage if we have all dimensions
  IF p_length IS NOT NULL AND p_width IS NOT NULL AND p_height IS NOT NULL THEN
    UPDATE sites
    SET cubic_footage = p_length * p_width * p_height
    WHERE site_id = v_site_id;
  END IF;

  -- Build response
  v_result := jsonb_build_object(
    'success', true,
    'site_id', v_site_id,
    'message', 'Site created successfully'
  );
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Failed to create site: ' || SQLERRM
    );
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.create_site_without_history TO authenticated;

-- Add comment to function
COMMENT ON FUNCTION public.create_site_without_history IS 'Creates a new site with optional template defaults and site properties without recording a history event.';