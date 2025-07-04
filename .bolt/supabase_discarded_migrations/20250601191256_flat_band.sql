-- Refactor Site Templates into Sites Table
-- This migration moves template data from site_templates table into columns on the sites table

-- 1. Add new columns to sites table
ALTER TABLE sites ADD COLUMN submission_defaults JSONB NULL;
ALTER TABLE sites ADD COLUMN petri_defaults JSONB NULL;

-- 2. Copy existing template data to sites table
UPDATE sites s
SET 
  submission_defaults = st.submission_defaults,
  petri_defaults = st.petri_defaults
FROM site_templates st
WHERE s.site_id = st.site_id;

-- 3. Create or update functions to handle template data directly in sites
-- Update the create_site_without_history function to include template defaults
CREATE OR REPLACE FUNCTION create_site_without_history(
  p_name VARCHAR(100),
  p_type site_type_enum,
  p_program_id UUID,
  p_submission_defaults JSONB DEFAULT NULL,
  p_petri_defaults JSONB DEFAULT NULL
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
  
  -- Insert the new site with template defaults
  INSERT INTO sites (name, type, program_id, submission_defaults, petri_defaults)
  VALUES (p_name, p_type, p_program_id, p_submission_defaults, p_petri_defaults)
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

-- Create function to update site template defaults
CREATE OR REPLACE FUNCTION update_site_template_defaults(
  p_site_id UUID,
  p_submission_defaults JSONB,
  p_petri_defaults JSONB
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
  
  -- Update the site with new template defaults
  UPDATE sites
  SET 
    submission_defaults = p_submission_defaults,
    petri_defaults = p_petri_defaults,
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

-- Create function to clear site template defaults
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
  
  -- Clear the site template defaults
  UPDATE sites
  SET 
    submission_defaults = NULL,
    petri_defaults = NULL,
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

-- 4. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_site_without_history(VARCHAR, site_type_enum, UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_site_template_defaults(UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_site_template_defaults(UUID) TO authenticated;

-- 5. Drop the site_templates table and related objects
DROP FUNCTION IF EXISTS get_site_template(UUID);
DROP FUNCTION IF EXISTS upsert_site_template(UUID, JSONB, JSONB);
DROP TABLE IF EXISTS site_templates;

-- 6. Add comments for documentation
COMMENT ON COLUMN sites.submission_defaults IS 'JSONB object containing default values for submissions at this site';
COMMENT ON COLUMN sites.petri_defaults IS 'JSONB array of objects containing default values for petri observations at this site';