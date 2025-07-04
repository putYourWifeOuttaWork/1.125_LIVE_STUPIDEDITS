/*
  # Gasifier Integration Migration
  
  1. New Features
    - Adds gasifier tracking functionality to the FieldOps application
    - Creates ENUMs for chemical types, placement configurations
    - Extends sites table with gasifier defaults and counts
    - Creates gasifier_observations table with RLS
    - Implements triggers and functions for gasifier management
    
  2. Tables and Columns
    - New gasifier_observations table for storing gasifier readings
    - New gasifier_defaults JSONB column in sites table
    - New total_gasifiers column in sites table for roll-up counts
    
  3. Security
    - Row Level Security policies for gasifier_observations
    - Updated history logging for audit trail
*/

-- 1. Create new ENUM types for gasifier-related fields

-- Chemical type options
CREATE TYPE chemical_type_enum AS ENUM (
  'Geraniol', 
  'CLO2', 
  'Acetic Acid', 
  'Citronella Blend', 
  'Essential Oils Blend', 
  '1-MCP', 
  'Other'
);

-- Placement height options
CREATE TYPE placement_height_enum AS ENUM (
  'High', 
  'Medium', 
  'Low'
);

-- Directional placement options
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

-- Placement strategy options
CREATE TYPE placement_strategy_enum AS ENUM (
  'Perimeter Coverage', 
  'Centralized Coverage', 
  'Centralized and Perimeter Coverage', 
  'Targeted Coverage', 
  'Spot Placement Coverage'
);

-- 2. Extend sites table with gasifier-related columns
ALTER TABLE sites 
ADD COLUMN gasifier_defaults JSONB DEFAULT '[]'::jsonb,
ADD COLUMN total_gasifiers INTEGER DEFAULT 0;

-- 3. Create the gasifier_observations table
CREATE TABLE gasifier_observations (
  observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  gasifier_code TEXT NOT NULL,
  image_url TEXT NOT NULL,
  chemical_type chemical_type_enum NOT NULL,
  measure NUMERIC CHECK (measure >= 0 AND measure <= 10),
  anomaly BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  lastupdated_by UUID REFERENCES auth.users(id),
  program_id UUID REFERENCES pilot_programs(program_id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_gasifier_observations_submission_id ON gasifier_observations(submission_id);
CREATE INDEX idx_gasifier_observations_site_id ON gasifier_observations(site_id);
CREATE INDEX idx_gasifier_observations_gasifier_code ON gasifier_observations(gasifier_code);
CREATE INDEX idx_gasifier_observations_program_id ON gasifier_observations(program_id);

-- 4. Enable RLS on gasifier_observations
ALTER TABLE gasifier_observations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for gasifier_observations
-- Policy for SELECT: Allow users to view observations if they are part of the program or company
CREATE POLICY "gasifier_observations_policy" ON gasifier_observations
  FOR SELECT
  USING (
    submission_id IN (
      -- Direct program access through pilot_program_users
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    ) 
    OR 
    -- Company-based access
    submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
      WHERE pilot_programs.company_id IN (
        SELECT company_id FROM users
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    )
  );

-- Policy for INSERT: Allow users to insert observations if they are part of the program with non-ReadOnly role
CREATE POLICY "gasifier_observations_insert" ON gasifier_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
      AND pilot_program_users.role != 'ReadOnly'
    )
  );

-- Policy for UPDATE: Allow users to update observations if they are Admin or Edit role
CREATE POLICY "gasifier_observations_update" ON gasifier_observations
  FOR UPDATE
  TO authenticated
  USING (
    submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
      AND (pilot_program_users.role = 'Admin' OR pilot_program_users.role = 'Edit')
    )
  );

-- Policy for DELETE: Allow users to delete observations if they are Admin or Edit role or company admin
CREATE POLICY "gasifier_observations_delete" ON gasifier_observations
  FOR DELETE
  TO authenticated
  USING (
    -- Program admins and editors can delete
    submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
      AND (pilot_program_users.role = 'Admin' OR pilot_program_users.role = 'Edit')
    )
    -- OR company admins can delete
    OR submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
      WHERE is_company_admin_for_program(pilot_programs.program_id)
    )
  );

-- 5. Create function to set program_id automatically for gasifier observations
CREATE OR REPLACE FUNCTION set_gasifier_program_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.program_id := (SELECT program_id FROM public.submissions WHERE submission_id = NEW.submission_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to set program_id
CREATE TRIGGER set_gasifier_program_id_trigger
BEFORE INSERT ON gasifier_observations
FOR EACH ROW EXECUTE FUNCTION set_gasifier_program_id();

-- 6. Create function to update site gasifier counts based on unique gasifier codes
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

-- Create trigger function to update gasifier count when observations change
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

-- Add the trigger to the gasifier_observations table
CREATE TRIGGER update_site_gasifier_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON gasifier_observations
FOR EACH ROW EXECUTE PROCEDURE trigger_update_site_gasifier_count();

-- 7. Update history event type enum for gasifier events
ALTER TYPE history_event_type_enum ADD VALUE IF NOT EXISTS 'GasifierCreation';
ALTER TYPE history_event_type_enum ADD VALUE IF NOT EXISTS 'GasifierUpdate';
ALTER TYPE history_event_type_enum ADD VALUE IF NOT EXISTS 'GasifierDeletion';

-- Create function for logging gasifier observation history
CREATE OR REPLACE FUNCTION log_gasifier_observation_history()
RETURNS TRIGGER AS $$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
BEGIN
  -- Handle the case when the operation is performed by the system or during migration
  IF auth.uid() IS NULL THEN
    RETURN NULL; -- Skip logging if there's no authenticated user
  END IF;

  -- We need to get the program_id from the submission
  IF TG_OP = 'DELETE' THEN
    SELECT program_id INTO program_id_val FROM submissions WHERE submission_id = OLD.submission_id;
  ELSE
    SELECT program_id INTO program_id_val FROM submissions WHERE submission_id = NEW.submission_id;
  END IF;
  
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

-- Add trigger for gasifier observation history logging
CREATE TRIGGER log_gasifier_observation_history_trigger
AFTER INSERT OR UPDATE OR DELETE ON gasifier_observations
FOR EACH ROW EXECUTE FUNCTION log_gasifier_observation_history();

-- 8. Update the set_updated_at trigger for gasifier_observations
CREATE TRIGGER set_updated_at_gasifier_observations
BEFORE UPDATE ON gasifier_observations
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

-- 9. Update create_site_without_history function to include gasifier_defaults
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

-- 10. Update update_site_template_defaults function to include gasifier_defaults
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

-- 11. Update clear_site_template_defaults function to include gasifier_defaults
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

-- 12. Create insert_gasifier_observations function
CREATE OR REPLACE FUNCTION insert_gasifier_observations(
  p_submission_id UUID,
  p_site_id UUID,
  p_observations JSONB
)
RETURNS VOID AS $$
DECLARE
  obs JSONB;
BEGIN
  FOR obs IN SELECT jsonb_array_elements(p_observations)
  LOOP
    INSERT INTO gasifier_observations (
      submission_id,
      site_id,
      gasifier_code,
      image_url,
      chemical_type,
      measure,
      anomaly,
      notes,
      lastupdated_by
    )
    VALUES (
      p_submission_id,
      p_site_id,
      obs->>'gasifier_code',
      obs->>'image_url',
      (obs->>'chemical_type')::chemical_type_enum,
      (obs->>'measure')::NUMERIC,
      COALESCE((obs->>'anomaly')::BOOLEAN, FALSE),
      obs->>'notes',
      auth.uid()
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_site_without_history(VARCHAR, site_type_enum, UUID, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_site_template_defaults(UUID, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_site_template_defaults(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_gasifier_observations(UUID, UUID, JSONB) TO authenticated;

-- 13. Add comments for documentation
COMMENT ON TABLE gasifier_observations IS 'Stores gasifier observations per submission.';
COMMENT ON COLUMN sites.gasifier_defaults IS 'JSONB array of objects containing default values for gasifier observations at this site';
COMMENT ON COLUMN sites.total_gasifiers IS 'Roll-up count of unique gasifier codes at this site';