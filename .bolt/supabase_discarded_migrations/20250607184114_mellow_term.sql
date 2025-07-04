-- 1. Create new ENUM types for gasifier-related fields if they don't already exist

-- Only create chemical_type_enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chemical_type_enum') THEN
    CREATE TYPE chemical_type_enum AS ENUM (
      'Geraniol', 
      'CLO2', 
      'Acetic Acid', 
      'Citronella Blend', 
      'Essential Oils Blend', 
      '1-MCP', 
      'Other'
    );
  END IF;
END $$;

-- Only create placement_height_enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'placement_height_enum') THEN
    CREATE TYPE placement_height_enum AS ENUM (
      'High', 
      'Medium', 
      'Low'
    );
  END IF;
END $$;

-- Only create directional_placement_enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'directional_placement_enum') THEN
    CREATE TYPE directional_placement_enum AS ENUM (
      'Front-Center', 
      'Front-Left', 
      'Front-Right', 
      'Center-Center', 
      'Center-Left', 
      'Center-Right', 
      'Back-Center', 
      'Back-Left', 
      'Back-Right'
    );
  END IF;
END $$;

-- Only create placement_strategy_enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'placement_strategy_enum') THEN
    CREATE TYPE placement_strategy_enum AS ENUM (
      'Perimeter Coverage', 
      'Centralized Coverage', 
      'Centralized and Perimeter Coverage', 
      'Targeted Coverage', 
      'Spot Placement Coverage'
    );
  END IF;
END $$;

-- 2. Add placement-related columns to gasifier_observations table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gasifier_observations' AND column_name = 'placement_height') THEN
    ALTER TABLE gasifier_observations ADD COLUMN placement_height placement_height_enum;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gasifier_observations' AND column_name = 'directional_placement') THEN
    ALTER TABLE gasifier_observations ADD COLUMN directional_placement directional_placement_enum;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gasifier_observations' AND column_name = 'placement_strategy') THEN
    ALTER TABLE gasifier_observations ADD COLUMN placement_strategy placement_strategy_enum;
  END IF;
END $$;

-- 3. Update create_site_without_history function to support gasifier_defaults
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
BEGIN
  -- Temporarily disable the trigger that logs site history
  ALTER TABLE sites DISABLE TRIGGER log_site_history_trigger;
  
  -- Insert the new site with template defaults including gasifier defaults
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
    p_petri_defaults,
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

-- 4. Update update_site_template_defaults function to include gasifier_defaults
CREATE OR REPLACE FUNCTION update_site_template_defaults(
  p_site_id UUID,
  p_submission_defaults JSONB,
  p_petri_defaults JSONB,
  p_gasifier_defaults JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  
  -- Update the site with new template defaults including gasifier defaults
  UPDATE sites
  SET 
    submission_defaults = p_submission_defaults,
    petri_defaults = p_petri_defaults,
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

-- 5. Update clear_site_template_defaults function to include gasifier_defaults
CREATE OR REPLACE FUNCTION clear_site_template_defaults(
  p_site_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  
  -- Clear the site template defaults including gasifier defaults
  UPDATE sites
  SET 
    submission_defaults = NULL,
    petri_defaults = NULL,
    gasifier_defaults = NULL,
    updated_at = NOW()
  WHERE site_id = p_site_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Site template defaults cleared successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Make sure the sites table has the gasifier_defaults column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'gasifier_defaults') THEN
    ALTER TABLE sites ADD COLUMN gasifier_defaults JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add function to handle gasifier program ID setting
CREATE OR REPLACE FUNCTION set_gasifier_program_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Set program_id from the related submission
  NEW.program_id := (SELECT program_id FROM submissions WHERE submission_id = NEW.submission_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for setting gasifier program_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_gasifier_program_id_trigger') THEN
    CREATE TRIGGER set_gasifier_program_id_trigger
    BEFORE INSERT ON gasifier_observations
    FOR EACH ROW EXECUTE FUNCTION set_gasifier_program_id();
  END IF;
END $$;

-- Create function and trigger for updating site gasifier count
CREATE OR REPLACE FUNCTION trigger_update_site_gasifier_count()
RETURNS TRIGGER AS $$
BEGIN
  -- For inserts and updates, update the count for the site
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    PERFORM update_site_gasifier_count(NEW.site_id);
  -- For deletes, update the count for the site that was affected
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM update_site_gasifier_count(OLD.site_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create function to update site gasifier count
CREATE OR REPLACE FUNCTION update_site_gasifier_count(s_site_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Update the site's total_gasifiers to count unique gasifier codes
  UPDATE sites
  SET total_gasifiers = (
    SELECT COUNT(DISTINCT gasifier_code)
    FROM gasifier_observations
    WHERE site_id = s_site_id
  )
  WHERE site_id = s_site_id;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for updating site gasifier count if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_site_gasifier_count_trigger') THEN
    CREATE TRIGGER update_site_gasifier_count_trigger
    AFTER INSERT OR DELETE OR UPDATE ON gasifier_observations
    FOR EACH ROW EXECUTE FUNCTION trigger_update_site_gasifier_count();
  END IF;
END $$;

-- Add history logging for gasifier observations
CREATE OR REPLACE FUNCTION log_gasifier_observation_history()
RETURNS TRIGGER AS $$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
BEGIN
  -- Handle the case when the operation is performed by the system or during migration
  IF auth.uid() IS NULL THEN
    RETURN NULL; -- Skip logging if there's no authenticated user (like during migrations)
  END IF;

  -- Get the program_id
  program_id_val := CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END;
  
  -- Determine the history event type
  IF TG_OP = 'INSERT' THEN
    history_type := 'GasifierCreation';
  ELSIF TG_OP = 'UPDATE' THEN
    history_type := 'GasifierUpdate';
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'GasifierDeletion';
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
      'gasifier_observation',
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
      RAISE WARNING 'Failed to log gasifier observation history: %', SQLERRM;
  END;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for logging gasifier observation history if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'log_gasifier_observation_history_trigger') THEN
    CREATE TRIGGER log_gasifier_observation_history_trigger
    AFTER INSERT OR DELETE OR UPDATE ON gasifier_observations
    FOR EACH ROW EXECUTE FUNCTION log_gasifier_observation_history();
  END IF;
END $$;

-- Add constraint for measure (0-10 scale) if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.check_constraints 
    WHERE constraint_name = 'gasifier_observations_measure_check'
  ) THEN
    ALTER TABLE gasifier_observations ADD CONSTRAINT gasifier_observations_measure_check
    CHECK (measure IS NULL OR (measure >= 0 AND measure <= 10));
  END IF;
END $$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_site_without_history(VARCHAR, site_type_enum, UUID, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_site_template_defaults(UUID, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_site_template_defaults(UUID) TO authenticated;