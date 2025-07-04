/*
  # Add Site Environmental and Material Surface Fields
  
  1. New ENUMs
    - interior_working_surface_type_enum: For storing the types of working surfaces
    - microbial_risk_zone_enum: For classifying microbial risk levels
    - airflow_type_enum: Replacing the boolean airflow with more specific types
  
  2. New Columns
    - interior_working_surface_types: Array of surface types
    - microbial_risk_zone: Risk classification
    - quantity_deadzones: Count of deadzones (1-25)
  
  3. Changes
    - Modify airflow column in submissions table from boolean to enum
*/

-- 1. Create new ENUM types

-- Interior working surface types
CREATE TYPE interior_working_surface_type_enum AS ENUM (
  'Stainless Steel',
  'Unfinished Concrete',
  'Wood',
  'Plastic',
  'Granite',
  'Other Non-Absorbative'
);

-- Microbial risk zone classification
CREATE TYPE microbial_risk_zone_enum AS ENUM (
  'Low',
  'Medium',
  'High'
);

-- Airflow types (replacing boolean)
CREATE TYPE airflow_type_enum AS ENUM (
  'Cross-Ventilation',
  'Positive Pressure',
  'Negative Pressure',
  'Neutral Sealed'
);

-- 2. Add new columns to sites table
ALTER TABLE sites 
ADD COLUMN interior_working_surface_types interior_working_surface_type_enum[] NULL,
ADD COLUMN microbial_risk_zone microbial_risk_zone_enum DEFAULT 'Medium'::microbial_risk_zone_enum,
ADD COLUMN quantity_deadzones INTEGER NULL CHECK (quantity_deadzones IS NULL OR (quantity_deadzones >= 1 AND quantity_deadzones <= 25));

-- 3. Create a temporary column for the new airflow type in submissions
ALTER TABLE submissions ADD COLUMN airflow_type airflow_type_enum NULL;

-- 4. Migrate data from the old boolean airflow to the new enum type
UPDATE submissions
SET airflow_type = CASE
  WHEN airflow = 'Open' THEN 'Cross-Ventilation'::airflow_type_enum
  WHEN airflow = 'Closed' THEN 'Neutral Sealed'::airflow_type_enum
  ELSE NULL
END;

-- 5. Drop the old airflow column and rename the new one
ALTER TABLE submissions DROP COLUMN airflow;
ALTER TABLE submissions RENAME COLUMN airflow_type TO airflow;

-- 6. Update the submission_defaults JSONB validation function if it exists
CREATE OR REPLACE FUNCTION validate_submission_defaults(defaults JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if required fields exist and are of correct type
  RETURN (
    (defaults ? 'temperature' AND jsonb_typeof(defaults->'temperature') IN ('number', 'string')) AND
    (defaults ? 'humidity' AND jsonb_typeof(defaults->'humidity') IN ('number', 'string')) AND
    (defaults ? 'airflow' AND jsonb_typeof(defaults->'airflow') = 'string') AND
    (defaults ? 'odor_distance' AND jsonb_typeof(defaults->'odor_distance') = 'string') AND
    -- These are optional but if present should be valid
    (NOT defaults ? 'indoor_temperature' OR jsonb_typeof(defaults->'indoor_temperature') IN ('number', 'string')) AND
    (NOT defaults ? 'indoor_humidity' OR jsonb_typeof(defaults->'indoor_humidity') IN ('number', 'string'))
  );
END;
$$ LANGUAGE plpgsql;

-- 7. Update the create_site_without_history function to include new fields
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
  p_num_regularly_opened_ports INTEGER DEFAULT NULL,
  -- New fields
  p_interior_working_surface_types interior_working_surface_type_enum[] DEFAULT NULL,
  p_microbial_risk_zone microbial_risk_zone_enum DEFAULT 'Medium'::microbial_risk_zone_enum,
  p_quantity_deadzones INTEGER DEFAULT NULL
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
      
      -- Add additional bags for deadzones if specified
      IF p_has_dead_zones AND p_quantity_deadzones IS NOT NULL AND p_quantity_deadzones > 0 THEN
        v_recommended_bags := v_recommended_bags + p_quantity_deadzones;
      END IF;
      
      -- Add additional bag if wood or concrete surfaces are selected
      IF p_interior_working_surface_types IS NOT NULL AND 
         (array_position(p_interior_working_surface_types, 'Wood'::interior_working_surface_type_enum) IS NOT NULL OR
          array_position(p_interior_working_surface_types, 'Unfinished Concrete'::interior_working_surface_type_enum) IS NOT NULL) THEN
        v_recommended_bags := v_recommended_bags + 1;
      END IF;
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
    num_regularly_opened_ports,
    -- New fields
    interior_working_surface_types,
    microbial_risk_zone,
    quantity_deadzones
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
    p_num_regularly_opened_ports,
    -- New fields
    p_interior_working_surface_types,
    p_microbial_risk_zone,
    p_quantity_deadzones
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

-- 8. Update the update_site_properties function to include new fields
CREATE OR REPLACE FUNCTION update_site_properties(
  p_site_id UUID,
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
  p_hvac_system_present BOOLEAN DEFAULT NULL,
  p_hvac_system_type hvac_system_type_enum DEFAULT NULL,
  p_irrigation_system_type irrigation_system_type_enum DEFAULT NULL,
  p_lighting_system lighting_system_enum DEFAULT NULL,
  -- New fields
  p_interior_working_surface_types interior_working_surface_type_enum[] DEFAULT NULL,
  p_microbial_risk_zone microbial_risk_zone_enum DEFAULT NULL,
  p_quantity_deadzones INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_program_id UUID;
  v_result JSONB;
  v_recommended_bags INTEGER;
  v_square_footage NUMERIC;
  v_has_dead_zones BOOLEAN;
BEGIN
  -- Get the program_id for this site
  SELECT 
    program_id, 
    square_footage,
    has_dead_zones
  INTO 
    v_program_id,
    v_square_footage,
    v_has_dead_zones
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
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient permissions to update site properties');
  END IF;
  
  -- Recalculate recommended bags if we have square footage and density info
  IF v_square_footage IS NOT NULL THEN
    -- Get the min_efficacious_gasifier_density_sqft_per_bag
    SELECT 
      CEILING(v_square_footage / min_efficacious_gasifier_density_sqft_per_bag)
    INTO v_recommended_bags
    FROM sites
    WHERE site_id = p_site_id;
    
    -- Add additional bags for deadzones if specified
    IF (p_has_dead_zones IS NOT NULL AND p_has_dead_zones) OR 
       (p_has_dead_zones IS NULL AND v_has_dead_zones) THEN
      IF p_quantity_deadzones IS NOT NULL AND p_quantity_deadzones > 0 THEN
        v_recommended_bags := v_recommended_bags + p_quantity_deadzones;
      END IF;
    END IF;
    
    -- Add additional bag if wood or concrete surfaces are selected
    IF p_interior_working_surface_types IS NOT NULL AND 
       (array_position(p_interior_working_surface_types, 'Wood'::interior_working_surface_type_enum) IS NOT NULL OR
        array_position(p_interior_working_surface_types, 'Unfinished Concrete'::interior_working_surface_type_enum) IS NOT NULL) THEN
      v_recommended_bags := v_recommended_bags + 1;
    END IF;
  ELSE
    v_recommended_bags := NULL;
  END IF;
  
  -- Update the site's properties
  UPDATE sites
  SET 
    -- Physical attributes
    square_footage = COALESCE(p_square_footage, square_footage),
    cubic_footage = COALESCE(p_cubic_footage, cubic_footage),
    num_vents = COALESCE(p_num_vents, num_vents),
    vent_placements = COALESCE(p_vent_placements, vent_placements),
    -- Facility details
    primary_function = COALESCE(p_primary_function, primary_function),
    construction_material = COALESCE(p_construction_material, construction_material),
    insulation_type = COALESCE(p_insulation_type, insulation_type),
    -- Environmental controls
    hvac_system_present = COALESCE(p_hvac_system_present, hvac_system_present),
    hvac_system_type = COALESCE(p_hvac_system_type, hvac_system_type),
    irrigation_system_type = COALESCE(p_irrigation_system_type, irrigation_system_type),
    lighting_system = COALESCE(p_lighting_system, lighting_system),
    -- New fields
    interior_working_surface_types = COALESCE(p_interior_working_surface_types, interior_working_surface_types),
    microbial_risk_zone = COALESCE(p_microbial_risk_zone, microbial_risk_zone),
    quantity_deadzones = COALESCE(p_quantity_deadzones, quantity_deadzones),
    -- Update recommended bags if calculated
    recommended_placement_density_bags = COALESCE(v_recommended_bags, recommended_placement_density_bags),
    -- Update metadata
    updated_at = now(),
    lastupdated_by = auth.uid()
  WHERE site_id = p_site_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Site properties updated successfully');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 9. Grant execute permissions
GRANT EXECUTE ON FUNCTION create_site_without_history(
  VARCHAR, site_type_enum, UUID, JSONB, JSONB, JSONB,
  NUMERIC, NUMERIC, INTEGER, vent_placement_enum[],
  primary_function_enum, construction_material_enum, insulation_type_enum,
  BOOLEAN, hvac_system_type_enum, irrigation_system_type_enum, lighting_system_enum,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, INTEGER,
  interior_working_surface_type_enum[], microbial_risk_zone_enum, INTEGER
) TO authenticated;

GRANT EXECUTE ON FUNCTION update_site_properties(
  UUID, NUMERIC, NUMERIC, INTEGER, vent_placement_enum[],
  primary_function_enum, construction_material_enum, insulation_type_enum,
  BOOLEAN, hvac_system_type_enum, irrigation_system_type_enum, lighting_system_enum,
  interior_working_surface_type_enum[], microbial_risk_zone_enum, INTEGER
) TO authenticated;

-- 10. Add comments for documentation
COMMENT ON COLUMN sites.interior_working_surface_types IS 'Array of interior working surface types in the facility';
COMMENT ON COLUMN sites.microbial_risk_zone IS 'Classification of microbial risk level for the site';
COMMENT ON COLUMN sites.quantity_deadzones IS 'Number of deadzones that need coverage (1-25)';
COMMENT ON COLUMN submissions.airflow IS 'Type of airflow system in place during submission';