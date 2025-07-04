/*
  # Add Site Dimensions and Gasifier Density
  
  1. New Columns
    - Add length, width, height for physical dimensions
    - Add min_efficacious_gasifier_density_sqft_per_bag for defining coverage area
    - Add recommended_placement_density_bags to store calculated value
    - Add has_dead_zones and num_regularly_opened_ports for airflow dynamics
    
  2. New Functions
    - Create update_site_dimensions_and_density function to calculate square_footage, 
      cubic_footage, and recommended_placement_density_bags
    - Update create_site_without_history to support the new fields
    
  3. Security
    - Ensure proper permission checks for user access to site data
    - Functions use SECURITY DEFINER to maintain permissions
*/

-- Add new columns to sites table
ALTER TABLE sites 
ADD COLUMN length NUMERIC,
ADD COLUMN width NUMERIC,
ADD COLUMN height NUMERIC,
ADD COLUMN min_efficacious_gasifier_density_sqft_per_bag NUMERIC DEFAULT 2000,
ADD COLUMN recommended_placement_density_bags INTEGER,
ADD COLUMN has_dead_zones BOOLEAN DEFAULT FALSE,
ADD COLUMN num_regularly_opened_ports INTEGER;

-- Create function to calculate dimensions and density
CREATE OR REPLACE FUNCTION update_site_dimensions_and_density(
  p_site_id UUID,
  p_length NUMERIC,
  p_width NUMERIC,
  p_height NUMERIC,
  p_min_efficacious_gasifier_density_sqft_per_bag NUMERIC DEFAULT 2000,
  p_has_dead_zones BOOLEAN DEFAULT FALSE,
  p_num_regularly_opened_ports INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_square_footage NUMERIC;
  v_cubic_footage NUMERIC;
  v_recommended_bags INTEGER;
  v_program_id UUID;
  v_result JSONB;
BEGIN
  -- Get the program_id for this site
  SELECT program_id INTO v_program_id
  FROM sites
  WHERE site_id = p_site_id;
  
  IF v_program_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Site not found');
  END IF;
  
  -- Check if the user has permission to update this site
  IF NOT (
    EXISTS (
      SELECT 1 FROM pilot_program_users
      WHERE program_id = v_program_id
      AND user_id = auth.uid()
      AND (role = 'Admin' OR role = 'Edit')
    ) OR 
    is_company_admin_for_program(v_program_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient permissions to update site dimensions');
  END IF;
  
  -- Calculate square footage and cubic footage
  v_square_footage := p_length * p_width;
  v_cubic_footage := v_square_footage * p_height;
  
  -- Calculate recommended number of gasifier bags
  IF p_min_efficacious_gasifier_density_sqft_per_bag > 0 THEN
    v_recommended_bags := CEILING(v_square_footage / p_min_efficacious_gasifier_density_sqft_per_bag);
  ELSE
    v_recommended_bags := NULL;
  END IF;
  
  -- Update the site's dimensions and derived values
  UPDATE sites
  SET 
    length = p_length,
    width = p_width,
    height = p_height,
    square_footage = v_square_footage,
    cubic_footage = v_cubic_footage,
    min_efficacious_gasifier_density_sqft_per_bag = p_min_efficacious_gasifier_density_sqft_per_bag,
    recommended_placement_density_bags = v_recommended_bags,
    has_dead_zones = p_has_dead_zones,
    num_regularly_opened_ports = p_num_regularly_opened_ports,
    updated_at = now(),
    lastupdated_by = auth.uid()
  WHERE site_id = p_site_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Site dimensions and density updated successfully',
    'square_footage', v_square_footage,
    'cubic_footage', v_cubic_footage,
    'recommended_bags', v_recommended_bags
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Update create_site_without_history function to include new fields
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
  p_num_openings INTEGER DEFAULT NULL,
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
  
  -- Insert the new site with all properties
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
    num_openings,
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
    p_num_openings,
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_site_dimensions_and_density(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, INTEGER) TO authenticated;

-- Add comments to document the new columns
COMMENT ON COLUMN sites.length IS 'Length of the facility in feet';
COMMENT ON COLUMN sites.width IS 'Width of the facility in feet';
COMMENT ON COLUMN sites.height IS 'Height of the facility in feet';
COMMENT ON COLUMN sites.min_efficacious_gasifier_density_sqft_per_bag IS 'Number of square feet that one gasifier bag can effectively cover';
COMMENT ON COLUMN sites.recommended_placement_density_bags IS 'Calculated number of gasifier bags needed based on square footage';
COMMENT ON COLUMN sites.has_dead_zones IS 'Whether the facility has areas with poor air circulation';
COMMENT ON COLUMN sites.num_regularly_opened_ports IS 'Number of doors/ports that are regularly opened/closed';