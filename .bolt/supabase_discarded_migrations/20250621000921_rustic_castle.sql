/*
  # Add Site Code and Program Cloning Support
  
  1. New Features
    - Add site_code column to sites table for persistent identification
    - Add cloned_from_program_id to pilot_programs table for lineage tracking
    - Add phases JSONB field to pilot_programs for phase tracking
    - Create RPC functions for cloning programs and sites
    
  2. Purpose
    - Enable program cloning for different experimental phases
    - Maintain site identity across program iterations
    - Support scientific framework with control and experimental phases
*/

-- 1. Add site_code column to sites table
ALTER TABLE sites ADD COLUMN site_code BIGINT;

-- 2. Create sequence for site_code starting at 1000001
CREATE SEQUENCE IF NOT EXISTS site_code_seq START WITH 1000001;

-- 3. Add cloned_from_program_id to pilot_programs table
ALTER TABLE pilot_programs ADD COLUMN cloned_from_program_id UUID REFERENCES pilot_programs(program_id);

-- 4. Add phases JSONB field to pilot_programs table
ALTER TABLE pilot_programs ADD COLUMN phases JSONB;

-- 5. Create function to generate a new site_code
CREATE OR REPLACE FUNCTION generate_site_code()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_code BIGINT;
BEGIN
  -- Get the next value from the sequence
  SELECT nextval('site_code_seq') INTO new_code;
  RETURN new_code;
END;
$$;

-- 6. Create function to clone a program
CREATE OR REPLACE FUNCTION clone_program(
  p_source_program_id UUID,
  p_new_name TEXT,
  p_new_description TEXT,
  p_new_start_date DATE,
  p_new_end_date DATE,
  p_site_overrides JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source_program RECORD;
  v_new_program_id UUID;
  v_site RECORD;
  v_new_site_id UUID;
  v_site_count INTEGER := 0;
  v_result JSONB;
  v_site_mapping JSONB := '{}'::JSONB;
  v_source_phases JSONB;
  v_new_phases JSONB;
  v_next_phase_number INTEGER := 1;
  v_company_id UUID;
  v_site_override JSONB;
  v_error TEXT;
BEGIN
  -- Check if source program exists
  SELECT * INTO v_source_program
  FROM pilot_programs
  WHERE program_id = p_source_program_id;
  
  IF v_source_program IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Source program not found'
    );
  END IF;
  
  -- Check if user has permission to clone this program
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users
    WHERE program_id = p_source_program_id
    AND user_id = auth.uid()
    AND role = 'Admin'
  ) AND NOT is_company_admin_for_program(p_source_program_id) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'You do not have permission to clone this program'
    );
  END IF;
  
  -- Get company_id from source program
  v_company_id := v_source_program.company_id;
  
  -- Get existing phases from source program
  v_source_phases := v_source_program.phases;
  
  -- Determine the next phase number
  IF v_source_phases IS NOT NULL AND jsonb_typeof(v_source_phases) = 'array' THEN
    -- Find the highest phase_number in the existing phases
    SELECT COALESCE(MAX(CAST(phase->>'phase_number' AS INTEGER)), 0) + 1
    INTO v_next_phase_number
    FROM jsonb_array_elements(v_source_phases) AS phase;
  END IF;
  
  -- Create new phases array by copying the source phases and adding a new phase
  IF v_source_phases IS NULL OR jsonb_typeof(v_source_phases) != 'array' THEN
    -- If no phases exist, create a new array with the first phase
    v_new_phases := jsonb_build_array(
      jsonb_build_object(
        'phase_number', v_next_phase_number,
        'phase_type', 'experimental',
        'label', 'Phase ' || v_next_phase_number,
        'start_date', p_new_start_date,
        'end_date', p_new_end_date,
        'notes', 'Cloned from program: ' || v_source_program.name
      )
    );
  ELSE
    -- Copy existing phases and add a new one
    v_new_phases := v_source_phases || jsonb_build_array(
      jsonb_build_object(
        'phase_number', v_next_phase_number,
        'phase_type', 'experimental',
        'label', 'Phase ' || v_next_phase_number,
        'start_date', p_new_start_date,
        'end_date', p_new_end_date,
        'notes', 'Cloned from program: ' || v_source_program.name
      )
    );
  END IF;
  
  -- Create new program as a clone of the source program
  INSERT INTO pilot_programs (
    name,
    description,
    start_date,
    end_date,
    status,
    company_id,
    cloned_from_program_id,
    phases
  )
  VALUES (
    p_new_name,
    p_new_description,
    p_new_start_date,
    p_new_end_date,
    -- Status will be automatically set by the update_program_status trigger
    v_company_id,
    p_source_program_id,
    v_new_phases
  )
  RETURNING program_id INTO v_new_program_id;
  
  -- Clone all sites from the source program
  FOR v_site IN 
    SELECT * FROM sites WHERE program_id = p_source_program_id
  LOOP
    -- Check if there are overrides for this site
    v_site_override := NULL;
    IF p_site_overrides IS NOT NULL AND jsonb_typeof(p_site_overrides) = 'object' THEN
      v_site_override := p_site_overrides->v_site.site_id::TEXT;
    END IF;
    
    -- Clone the site
    INSERT INTO sites (
      program_id,
      name,
      type,
      site_code, -- Use the same site_code to maintain identity across programs
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
      has_dead_zones,
      num_regularly_opened_ports,
      -- Location
      state,
      country,
      timezone,
      -- Environmental properties
      interior_working_surface_types,
      microbial_risk_zone,
      quantity_deadzones,
      ventilation_strategy
    )
    VALUES (
      v_new_program_id,
      v_site.name,
      v_site.type,
      COALESCE(v_site.site_code, generate_site_code()), -- Generate a new code if none exists
      -- Apply overrides if provided, otherwise use source values
      CASE 
        WHEN v_site_override IS NOT NULL AND v_site_override ? 'submission_defaults' 
        THEN v_site_override->'submission_defaults' 
        ELSE v_site.submission_defaults 
      END,
      CASE 
        WHEN v_site_override IS NOT NULL AND v_site_override ? 'petri_defaults' 
        THEN v_site_override->'petri_defaults' 
        ELSE v_site.petri_defaults 
      END,
      CASE 
        WHEN v_site_override IS NOT NULL AND v_site_override ? 'gasifier_defaults' 
        THEN v_site_override->'gasifier_defaults' 
        ELSE v_site.gasifier_defaults 
      END,
      -- Physical attributes
      v_site.square_footage,
      v_site.cubic_footage,
      v_site.num_vents,
      v_site.vent_placements,
      -- Facility details
      v_site.primary_function,
      v_site.construction_material,
      v_site.insulation_type,
      -- Environmental controls
      v_site.hvac_system_present,
      v_site.hvac_system_type,
      v_site.irrigation_system_type,
      v_site.lighting_system,
      -- New dimensions and density fields
      v_site.length,
      v_site.width,
      v_site.height,
      CASE 
        WHEN v_site_override IS NOT NULL AND v_site_override ? 'min_efficacious_gasifier_density_sqft_per_bag' 
        THEN (v_site_override->>'min_efficacious_gasifier_density_sqft_per_bag')::NUMERIC 
        ELSE v_site.min_efficacious_gasifier_density_sqft_per_bag 
      END,
      v_site.has_dead_zones,
      v_site.num_regularly_opened_ports,
      -- Location
      v_site.state,
      v_site.country,
      v_site.timezone,
      -- Environmental properties
      v_site.interior_working_surface_types,
      v_site.microbial_risk_zone,
      v_site.quantity_deadzones,
      v_site.ventilation_strategy
    )
    RETURNING site_id INTO v_new_site_id;
    
    -- Store the mapping between old and new site IDs
    v_site_mapping := v_site_mapping || jsonb_build_object(v_site.site_id::TEXT, v_new_site_id);
    
    -- Increment site count
    v_site_count := v_site_count + 1;
  END LOOP;
  
  -- Add the creator as an Admin for the new program
  INSERT INTO pilot_program_users (
    program_id,
    user_id,
    role
  )
  VALUES (
    v_new_program_id,
    auth.uid(),
    'Admin'
  );
  
  -- Return success response with details
  v_result := jsonb_build_object(
    'success', TRUE,
    'message', 'Program cloned successfully',
    'program_id', v_new_program_id,
    'site_count', v_site_count,
    'site_mapping', v_site_mapping
  );
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = PG_EXCEPTION_DETAIL;
    
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM,
      'detail', v_error
    );
END;
$$;

-- 7. Create function to get program phases
CREATE OR REPLACE FUNCTION get_program_phases(p_program_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phases JSONB;
  v_program_lineage UUID[];
  v_current_program_id UUID := p_program_id;
  v_combined_phases JSONB := '[]'::JSONB;
BEGIN
  -- Check if program exists
  IF NOT EXISTS (SELECT 1 FROM pilot_programs WHERE program_id = p_program_id) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Program not found'
    );
  END IF;
  
  -- Build the program lineage (current program and all ancestors)
  v_program_lineage := ARRAY[p_program_id];
  
  -- Traverse up the lineage
  LOOP
    -- Get the cloned_from_program_id of the current program
    SELECT cloned_from_program_id INTO v_current_program_id
    FROM pilot_programs
    WHERE program_id = v_current_program_id;
    
    -- Exit the loop if we've reached the root program
    IF v_current_program_id IS NULL THEN
      EXIT;
    END IF;
    
    -- Add the ancestor program to the lineage
    v_program_lineage := v_program_lineage || v_current_program_id;
  END LOOP;
  
  -- Collect phases from all programs in the lineage
  FOR i IN 1..array_length(v_program_lineage, 1) LOOP
    SELECT phases INTO v_phases
    FROM pilot_programs
    WHERE program_id = v_program_lineage[i];
    
    -- If phases exist, add them to the combined phases
    IF v_phases IS NOT NULL AND jsonb_typeof(v_phases) = 'array' THEN
      v_combined_phases := v_combined_phases || v_phases;
    END IF;
  END LOOP;
  
  -- Return the combined phases
  RETURN jsonb_build_object(
    'success', TRUE,
    'phases', v_combined_phases,
    'program_id', p_program_id,
    'lineage', to_jsonb(v_program_lineage)
  );
END;
$$;

-- 8. Create function to get program lineage
CREATE OR REPLACE FUNCTION get_program_lineage(p_program_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lineage JSONB := '[]'::JSONB;
  v_current_program_id UUID := p_program_id;
  v_program RECORD;
  v_index INTEGER := 0;
BEGIN
  -- Check if program exists
  IF NOT EXISTS (SELECT 1 FROM pilot_programs WHERE program_id = p_program_id) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Program not found'
    );
  END IF;
  
  -- Start with the current program
  SELECT * INTO v_program
  FROM pilot_programs
  WHERE program_id = p_program_id;
  
  -- Add the current program to the lineage
  v_lineage := v_lineage || jsonb_build_object(
    'program_id', v_program.program_id,
    'name', v_program.name,
    'start_date', v_program.start_date,
    'end_date', v_program.end_date,
    'status', v_program.status,
    'index', v_index
  );
  
  -- Traverse up the lineage
  LOOP
    -- Get the cloned_from_program_id of the current program
    SELECT cloned_from_program_id INTO v_current_program_id
    FROM pilot_programs
    WHERE program_id = v_current_program_id;
    
    -- Exit the loop if we've reached the root program
    IF v_current_program_id IS NULL THEN
      EXIT;
    END IF;
    
    -- Increment the index
    v_index := v_index + 1;
    
    -- Get the ancestor program
    SELECT * INTO v_program
    FROM pilot_programs
    WHERE program_id = v_current_program_id;
    
    -- Add the ancestor program to the lineage
    v_lineage := v_lineage || jsonb_build_object(
      'program_id', v_program.program_id,
      'name', v_program.name,
      'start_date', v_program.start_date,
      'end_date', v_program.end_date,
      'status', v_program.status,
      'index', v_index
    );
  END LOOP;
  
  -- Return the lineage
  RETURN jsonb_build_object(
    'success', TRUE,
    'lineage', v_lineage,
    'program_id', p_program_id
  );
END;
$$;

-- 9. Create function to get site lineage
CREATE OR REPLACE FUNCTION get_site_lineage(p_site_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lineage JSONB := '[]'::JSONB;
  v_site RECORD;
  v_program RECORD;
  v_program_lineage UUID[];
  v_current_program_id UUID;
  v_site_code BIGINT;
BEGIN
  -- Check if site exists
  SELECT * INTO v_site
  FROM sites
  WHERE site_id = p_site_id;
  
  IF v_site IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Site not found'
    );
  END IF;
  
  -- Get the site_code
  v_site_code := v_site.site_code;
  
  -- If site_code is NULL, we can't trace lineage
  IF v_site_code IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Site has no site_code, cannot trace lineage'
    );
  END IF;
  
  -- Get the program lineage
  v_current_program_id := v_site.program_id;
  v_program_lineage := ARRAY[v_current_program_id];
  
  -- Traverse up the program lineage
  LOOP
    -- Get the cloned_from_program_id of the current program
    SELECT cloned_from_program_id INTO v_current_program_id
    FROM pilot_programs
    WHERE program_id = v_current_program_id;
    
    -- Exit the loop if we've reached the root program
    IF v_current_program_id IS NULL THEN
      EXIT;
    END IF;
    
    -- Add the ancestor program to the lineage
    v_program_lineage := v_program_lineage || v_current_program_id;
  END LOOP;
  
  -- Add the current site to the lineage
  v_lineage := v_lineage || jsonb_build_object(
    'site_id', v_site.site_id,
    'site_code', v_site.site_code,
    'name', v_site.name,
    'program_id', v_site.program_id,
    'program_name', (SELECT name FROM pilot_programs WHERE program_id = v_site.program_id)
  );
  
  -- Find all related sites in ancestor programs
  FOR v_program IN 
    SELECT p.program_id, p.name
    FROM pilot_programs p
    WHERE p.program_id = ANY(v_program_lineage) AND p.program_id != v_site.program_id
  LOOP
    -- Find the site with the same site_code in this program
    FOR v_site IN 
      SELECT s.site_id, s.name
      FROM sites s
      WHERE s.program_id = v_program.program_id AND s.site_code = v_site_code
    LOOP
      -- Add the related site to the lineage
      v_lineage := v_lineage || jsonb_build_object(
        'site_id', v_site.site_id,
        'site_code', v_site_code,
        'name', v_site.name,
        'program_id', v_program.program_id,
        'program_name', v_program.name
      );
    END LOOP;
  END LOOP;
  
  -- Return the lineage
  RETURN jsonb_build_object(
    'success', TRUE,
    'lineage', v_lineage,
    'site_id', p_site_id,
    'site_code', v_site_code
  );
END;
$$;

-- 10. Create a trigger to set site_code on insert if not provided
CREATE OR REPLACE FUNCTION set_site_code()
RETURNS TRIGGER AS $$
BEGIN
  -- If site_code is NULL, generate a new one
  IF NEW.site_code IS NULL THEN
    NEW.site_code := generate_site_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER set_site_code_trigger
BEFORE INSERT ON sites
FOR EACH ROW
EXECUTE FUNCTION set_site_code();

-- 11. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION generate_site_code() TO authenticated;
GRANT EXECUTE ON FUNCTION clone_program(UUID, TEXT, TEXT, DATE, DATE, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_program_phases(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_program_lineage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_site_lineage(UUID) TO authenticated;

-- 12. Add comments for documentation
COMMENT ON COLUMN sites.site_code IS 'Persistent identifier for a site across program clones, starting at 1000001';
COMMENT ON COLUMN pilot_programs.cloned_from_program_id IS 'Reference to the source program if this was created by cloning';
COMMENT ON COLUMN pilot_programs.phases IS 'JSONB array of phase objects describing the program phases';

COMMENT ON FUNCTION generate_site_code() IS 'Generates a new unique site code starting from 1000001';
COMMENT ON FUNCTION clone_program(UUID, TEXT, TEXT, DATE, DATE, JSONB) IS 'Clones a program with all its sites and templates, with optional overrides';
COMMENT ON FUNCTION get_program_phases(UUID) IS 'Returns all phases for a program, including phases from ancestor programs';
COMMENT ON FUNCTION get_program_lineage(UUID) IS 'Returns the lineage of a program (current program and all ancestors)';
COMMENT ON FUNCTION get_site_lineage(UUID) IS 'Returns the lineage of a site (all sites with the same site_code across programs)';