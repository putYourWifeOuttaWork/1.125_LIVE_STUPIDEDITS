-- Fix migration to check if types already exist before creating them

DO $$
BEGIN
  -- Check if primary_function_enum already exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'primary_function_enum') THEN
    CREATE TYPE primary_function_enum AS ENUM (
      'Growing',
      'Drying',
      'Packaging',
      'Storage', 
      'Research',
      'Retail'
    );
  END IF;

  -- Check if construction_material_enum already exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'construction_material_enum') THEN
    CREATE TYPE construction_material_enum AS ENUM (
      'Glass',
      'Polycarbonate',
      'Metal',
      'Concrete',
      'Wood'
    );
  END IF;

  -- Check if insulation_type_enum already exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insulation_type_enum') THEN
    CREATE TYPE insulation_type_enum AS ENUM (
      'None',
      'Basic',
      'Moderate',
      'High'
    );
  END IF;

  -- Check if hvac_system_type_enum already exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hvac_system_type_enum') THEN
    CREATE TYPE hvac_system_type_enum AS ENUM (
      'Centralized',
      'Distributed',
      'Evaporative Cooling',
      'None'
    );
  END IF;

  -- Check if irrigation_system_type_enum already exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'irrigation_system_type_enum') THEN
    CREATE TYPE irrigation_system_type_enum AS ENUM (
      'Drip',
      'Sprinkler',
      'Hydroponic',
      'Manual'
    );
  END IF;

  -- Check if lighting_system_enum already exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lighting_system_enum') THEN
    CREATE TYPE lighting_system_enum AS ENUM (
      'Natural Light Only',
      'LED',
      'HPS',
      'Fluorescent'
    );
  END IF;

  -- Check if vent_placement_enum already exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vent_placement_enum') THEN
    CREATE TYPE vent_placement_enum AS ENUM (
      'Ceiling-Center',
      'Ceiling-Perimeter',
      'Upper-Walls',
      'Lower-Walls',
      'Floor-Level'
    );
  END IF;
END
$$;

-- 2. Add new columns to the sites table if they don't exist
DO $$
BEGIN
  -- Physical attributes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'square_footage') THEN
    ALTER TABLE sites ADD COLUMN square_footage NUMERIC CHECK (square_footage >= 100 AND square_footage <= 1000000000);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'cubic_footage') THEN
    ALTER TABLE sites ADD COLUMN cubic_footage NUMERIC CHECK (cubic_footage >= 25 AND cubic_footage <= 1000000);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'num_openings') THEN
    ALTER TABLE sites ADD COLUMN num_openings INTEGER CHECK (num_openings >= 1 AND num_openings <= 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'num_vents') THEN
    ALTER TABLE sites ADD COLUMN num_vents INTEGER CHECK (num_vents >= 1 AND num_vents <= 10000);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'vent_placements') THEN
    ALTER TABLE sites ADD COLUMN vent_placements vent_placement_enum[];
  END IF;

  -- Facility details
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'primary_function') THEN
    ALTER TABLE sites ADD COLUMN primary_function primary_function_enum;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'construction_material') THEN
    ALTER TABLE sites ADD COLUMN construction_material construction_material_enum;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'insulation_type') THEN
    ALTER TABLE sites ADD COLUMN insulation_type insulation_type_enum;
  END IF;

  -- Environmental controls
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'hvac_system_present') THEN
    ALTER TABLE sites ADD COLUMN hvac_system_present BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'hvac_system_type') THEN
    ALTER TABLE sites ADD COLUMN hvac_system_type hvac_system_type_enum;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'irrigation_system_type') THEN
    ALTER TABLE sites ADD COLUMN irrigation_system_type irrigation_system_type_enum;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'lighting_system') THEN
    ALTER TABLE sites ADD COLUMN lighting_system lighting_system_enum;
  END IF;
END
$$;

-- 3. Create function to update site properties
CREATE OR REPLACE FUNCTION update_site_properties(
  p_site_id UUID,
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
  p_hvac_system_present BOOLEAN DEFAULT NULL,
  p_hvac_system_type hvac_system_type_enum DEFAULT NULL,
  p_irrigation_system_type irrigation_system_type_enum DEFAULT NULL,
  p_lighting_system lighting_system_enum DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
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
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient permissions to update site properties');
  END IF;
  
  -- Update the site's properties
  UPDATE sites
  SET 
    -- Physical attributes
    square_footage = COALESCE(p_square_footage, square_footage),
    cubic_footage = COALESCE(p_cubic_footage, cubic_footage),
    num_openings = COALESCE(p_num_openings, num_openings),
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

-- 4. Update create_site_without_history function to include site properties
DROP FUNCTION IF EXISTS create_site_without_history(
  VARCHAR, site_type_enum, UUID, JSONB, JSONB, JSONB
);

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
  p_lighting_system lighting_system_enum DEFAULT NULL
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_site_id UUID;
  v_result JSONB;
BEGIN
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
    lighting_system
  )
  VALUES (
    p_name, 
    p_type, 
    p_program_id, 
    p_submission_defaults, 
    p_petri_defaults,
    p_gasifier_defaults,
    -- Physical attributes
    p_square_footage,
    p_cubic_footage,
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
    p_lighting_system
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

-- 5. Grant execute permissions
GRANT EXECUTE ON FUNCTION update_site_properties(
  UUID, NUMERIC, NUMERIC, INTEGER, INTEGER, vent_placement_enum[],
  primary_function_enum, construction_material_enum, insulation_type_enum,
  BOOLEAN, hvac_system_type_enum, irrigation_system_type_enum, lighting_system_enum
) TO authenticated;

GRANT EXECUTE ON FUNCTION create_site_without_history(
  VARCHAR, site_type_enum, UUID, JSONB, JSONB, JSONB,
  NUMERIC, NUMERIC, INTEGER, INTEGER, vent_placement_enum[],
  primary_function_enum, construction_material_enum, insulation_type_enum,
  BOOLEAN, hvac_system_type_enum, irrigation_system_type_enum, lighting_system_enum
) TO authenticated;

-- 6. Add comments for documentation
COMMENT ON COLUMN sites.square_footage IS 'Size of the facility in square feet (100-1,000,000,000)';
COMMENT ON COLUMN sites.cubic_footage IS 'Volume of the facility in cubic feet (25-1,000,000)';
COMMENT ON COLUMN sites.num_openings IS 'Number of windows/doors/ports in the facility (1-100)';
COMMENT ON COLUMN sites.num_vents IS 'Number of ventilation points in the facility (1-10,000)';
COMMENT ON COLUMN sites.vent_placements IS 'Array of vent placement positions';
COMMENT ON COLUMN sites.primary_function IS 'Main purpose of the site (e.g., Growing, Storage)';
COMMENT ON COLUMN sites.construction_material IS 'Primary construction material of the facility';
COMMENT ON COLUMN sites.insulation_type IS 'Quality level of insulation in the facility';
COMMENT ON COLUMN sites.hvac_system_present IS 'Whether the facility has an HVAC system';
COMMENT ON COLUMN sites.hvac_system_type IS 'Type of HVAC system if present';
COMMENT ON COLUMN sites.irrigation_system_type IS 'Type of irrigation system used';
COMMENT ON COLUMN sites.lighting_system IS 'Type of lighting system used';