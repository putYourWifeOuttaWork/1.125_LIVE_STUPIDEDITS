/*
  # Fix create_site_without_history Function Overloading

  1. Changes
    - Drop all existing versions of the create_site_without_history function
    - Create a single version with standardized parameter types
    - Ensure all parameters use TEXT type for string inputs
    
  2. Reason for Change
    - Current function has multiple overloaded versions with conflicting types
    - PostgreSQL cannot determine which function to call (error PGRST203)
    - This migration resolves the ambiguity by providing a single definitive version
*/

-- Drop all versions of the function to eliminate ambiguity
DROP FUNCTION IF EXISTS create_site_without_history(VARCHAR, site_type_enum, UUID, JSONB, JSONB, JSONB, NUMERIC, NUMERIC, INTEGER, vent_placement_enum[], primary_function_enum, construction_material_enum, insulation_type_enum, BOOLEAN, hvac_system_type_enum, irrigation_system_type_enum, lighting_system_enum, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, INTEGER, interior_working_surface_type_enum[], microbial_risk_zone_enum, INTEGER, ventilation_strategy_enum);

DROP FUNCTION IF EXISTS create_site_without_history(TEXT, site_type_enum, UUID, JSONB, JSONB, JSONB, NUMERIC, NUMERIC, INTEGER, vent_placement_enum[], primary_function_enum, construction_material_enum, insulation_type_enum, BOOLEAN, hvac_system_type_enum, irrigation_system_type_enum, lighting_system_enum, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, INTEGER, interior_working_surface_type_enum[], microbial_risk_zone_enum, INTEGER, ventilation_strategy_enum);

-- Create a single version of the function with standardized parameter types
CREATE OR REPLACE FUNCTION create_site_without_history(
  p_name TEXT,                                            -- Use TEXT for name parameter
  p_type site_type_enum,
  p_program_id UUID,
  p_submission_defaults JSONB DEFAULT NULL,
  p_petri_defaults JSONB DEFAULT NULL,
  p_gasifier_defaults JSONB DEFAULT NULL,
  p_square_footage NUMERIC DEFAULT NULL,
  p_cubic_footage NUMERIC DEFAULT NULL,
  p_num_vents INTEGER DEFAULT NULL,
  p_vent_placements vent_placement_enum[] DEFAULT NULL,
  p_primary_function primary_function_enum DEFAULT NULL,
  p_construction_material construction_material_enum DEFAULT NULL,
  p_insulation_type insulation_type_enum DEFAULT NULL,
  p_hvac_system_present BOOLEAN DEFAULT FALSE,
  p_hvac_system_type hvac_system_type_enum DEFAULT NULL,
  p_irrigation_system_type irrigation_system_type_enum DEFAULT NULL,
  p_lighting_system lighting_system_enum DEFAULT NULL,
  p_length NUMERIC DEFAULT NULL,
  p_width NUMERIC DEFAULT NULL,
  p_height NUMERIC DEFAULT NULL,
  p_min_efficacious_gasifier_density_sqft_per_bag NUMERIC DEFAULT 2000,
  p_has_dead_zones BOOLEAN DEFAULT FALSE,
  p_num_regularly_opened_ports INTEGER DEFAULT NULL,
  p_interior_working_surface_types interior_working_surface_type_enum[] DEFAULT NULL,
  p_microbial_risk_zone microbial_risk_zone_enum DEFAULT 'Medium',
  p_quantity_deadzones INTEGER DEFAULT NULL,
  p_ventilation_strategy ventilation_strategy_enum DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS policies
AS $$
DECLARE
  v_site_id UUID;
  v_error_message TEXT;
  v_debug_info JSONB;
BEGIN
  -- Verify user has permission to create a site in this program
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users
    WHERE program_id = p_program_id
    AND user_id = auth.uid()
    AND role IN ('Admin', 'Edit')
  ) AND NOT is_company_admin_for_program(p_program_id) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'You do not have permission to create sites in this program'
    );
  END IF;

  -- Insert the new site
  INSERT INTO sites (
    program_id,
    name,
    type,
    submission_defaults,
    petri_defaults,
    gasifier_defaults,
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
    ventilation_strategy
  )
  VALUES (
    p_program_id,
    p_name,
    p_type,
    p_submission_defaults,
    p_petri_defaults,
    p_gasifier_defaults,
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
    p_ventilation_strategy
  )
  RETURNING site_id INTO v_site_id;

  -- Check if site_id was returned
  IF v_site_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Site creation failed: No site_id returned'
    );
  END IF;

  -- Return success response with site_id
  RETURN jsonb_build_object(
    'success', TRUE,
    'site_id', v_site_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Get the error details
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    
    -- Create debug info
    v_debug_info := jsonb_build_object(
      'program_id', p_program_id,
      'name', p_name,
      'type', p_type,
      'user_id', auth.uid()
    );
    
    -- Return error response
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Site creation failed: ' || v_error_message,
      'debug_info', v_debug_info
    );
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_site_without_history(
  TEXT, site_type_enum, UUID, JSONB, JSONB, JSONB, NUMERIC, NUMERIC, INTEGER, vent_placement_enum[],
  primary_function_enum, construction_material_enum, insulation_type_enum, BOOLEAN, hvac_system_type_enum,
  irrigation_system_type_enum, lighting_system_enum, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, INTEGER,
  interior_working_surface_type_enum[], microbial_risk_zone_enum, INTEGER, ventilation_strategy_enum
) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION create_site_without_history(
  TEXT, site_type_enum, UUID, JSONB, JSONB, JSONB, NUMERIC, NUMERIC, INTEGER, vent_placement_enum[],
  primary_function_enum, construction_material_enum, insulation_type_enum, BOOLEAN, hvac_system_type_enum,
  irrigation_system_type_enum, lighting_system_enum, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, INTEGER,
  interior_working_surface_type_enum[], microbial_risk_zone_enum, INTEGER, ventilation_strategy_enum
) IS 'Creates a new site without triggering history events, with all possible parameters. Uses TEXT for string parameters to avoid type ambiguity.';