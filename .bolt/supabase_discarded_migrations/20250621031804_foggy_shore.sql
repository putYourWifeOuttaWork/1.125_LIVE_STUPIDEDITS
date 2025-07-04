-- Create enhanced version of the clone_program function with phase parameters
CREATE OR REPLACE FUNCTION clone_program(
  p_source_program_id UUID,
  p_new_name TEXT,
  p_new_description TEXT,
  p_new_start_date DATE,
  p_new_end_date DATE,
  p_new_phase_number INTEGER DEFAULT NULL,
  p_new_phase_type TEXT DEFAULT 'experimental',
  p_new_phase_label TEXT DEFAULT NULL,
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
  v_phase_label TEXT;
  v_company_id UUID;
  v_site_override JSONB;
  v_error TEXT;
  v_all_phases JSONB;
  v_phase_exists BOOLEAN := FALSE;
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
  
  -- Check if start date is at least 7 days before end date
  IF p_new_end_date < (p_new_start_date + INTERVAL '7 days')::date THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'End date must be at least 7 days after start date'
    );
  END IF;
  
  -- Get all phases from the program lineage
  DECLARE
    v_program_lineage UUID[] := ARRAY[p_source_program_id];
    v_current_program_id UUID := p_source_program_id;
    v_program_phases JSONB;
  BEGIN
    -- Build program lineage
    LOOP
      -- Get the parent program id
      SELECT cloned_from_program_id INTO v_current_program_id
      FROM pilot_programs
      WHERE program_id = v_current_program_id;
      
      -- Exit if we've reached the root program
      IF v_current_program_id IS NULL THEN
        EXIT;
      END IF;
      
      -- Add to lineage
      v_program_lineage := v_program_lineage || v_current_program_id;
    END LOOP;
    
    -- Initialize all phases array
    v_all_phases := '[]'::JSONB;
    
    -- Collect phases from all programs in the lineage
    FOR i IN 1..array_length(v_program_lineage, 1) LOOP
      SELECT phases INTO v_program_phases
      FROM pilot_programs
      WHERE program_id = v_program_lineage[i];
      
      -- If phases exist, add them to combined phases
      IF v_program_phases IS NOT NULL AND jsonb_typeof(v_program_phases) = 'array' THEN
        v_all_phases := v_all_phases || v_program_phases;
      END IF;
    END LOOP;
  END;
  
  -- Determine the next phase number if not provided
  IF p_new_phase_number IS NULL THEN
    IF v_all_phases IS NOT NULL AND jsonb_typeof(v_all_phases) = 'array' AND jsonb_array_length(v_all_phases) > 0 THEN
      -- Find the highest phase_number in all phases
      SELECT COALESCE(MAX(CAST(phase->>'phase_number' AS INTEGER)), 0) + 1
      INTO v_next_phase_number
      FROM jsonb_array_elements(v_all_phases) AS phase;
    ELSE
      v_next_phase_number := 1;
    END IF;
  ELSE
    v_next_phase_number := p_new_phase_number;
  END IF;
  
  -- Validate that the phase number and type combination is unique
  IF v_all_phases IS NOT NULL AND jsonb_typeof(v_all_phases) = 'array' AND jsonb_array_length(v_all_phases) > 0 THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_all_phases) AS phase
      WHERE CAST(phase->>'phase_number' AS INTEGER) = v_next_phase_number
      AND phase->>'phase_type' = p_new_phase_type
    ) INTO v_phase_exists;
    
    IF v_phase_exists THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'A phase with the same number and type already exists. Please choose a different phase number or type.'
      );
    END IF;
  END IF;
  
  -- Determine phase label
  IF p_new_phase_label IS NOT NULL AND p_new_phase_label != '' THEN
    v_phase_label := p_new_phase_label;
  ELSE
    v_phase_label := 'Phase ' || v_next_phase_number || ' (' || p_new_phase_type || ')';
  END IF;
  
  -- Create new phases array by copying the source phases and adding a new phase
  IF v_source_phases IS NULL OR jsonb_typeof(v_source_phases) != 'array' THEN
    -- If no phases exist, create a new array with the first phase
    v_new_phases := jsonb_build_array(
      jsonb_build_object(
        'phase_number', v_next_phase_number,
        'phase_type', p_new_phase_type,
        'label', v_phase_label,
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
        'phase_type', p_new_phase_type,
        'label', v_phase_label,
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
    status,  -- Including status in the column list
    company_id,
    cloned_from_program_id,
    phases
  )
  VALUES (
    p_new_name,
    p_new_description,
    p_new_start_date,
    p_new_end_date,
    'inactive'::program_status_enum,  -- Add default value that will be overwritten by trigger
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
  
  -- Return success response with details
  v_result := jsonb_build_object(
    'success', TRUE,
    'message', 'Program cloned successfully',
    'program_id', v_new_program_id,
    'site_count', v_site_count,
    'site_mapping', v_site_mapping,
    'phase_number', v_next_phase_number,
    'phase_type', p_new_phase_type
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

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION clone_program(
  UUID, TEXT, TEXT, DATE, DATE, INTEGER, TEXT, TEXT, JSONB
) TO authenticated;

-- Update comment for documentation
COMMENT ON FUNCTION clone_program(
  UUID, TEXT, TEXT, DATE, DATE, INTEGER, TEXT, TEXT, JSONB
) IS 'Clones a program with all its sites and templates, with optional phase parameters and site overrides';