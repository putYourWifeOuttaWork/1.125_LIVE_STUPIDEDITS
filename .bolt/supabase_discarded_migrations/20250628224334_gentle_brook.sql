/*
  # Fix Function Uniqueness Issues

  1. Changes
    - Explicitly drop template functions with full argument signatures
    - Recreate template functions with proper definitions
    - Ensure function names are uniquely identifiable for PostgreSQL
    
  2. Reason for Change
    - Resolving "function name is not unique" errors
    - Ensuring clean state for database migrations
*/

-- Drop all versions of both functions with explicit argument signatures
DROP FUNCTION IF EXISTS public.update_site_template_defaults(UUID, JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.update_site_template_defaults();
DROP FUNCTION IF EXISTS public.update_site_template_defaults(p_site_id UUID, p_submission_defaults JSONB, p_petri_defaults JSONB, p_gasifier_defaults JSONB);

DROP FUNCTION IF EXISTS public.clear_site_template_defaults(UUID);
DROP FUNCTION IF EXISTS public.clear_site_template_defaults();
DROP FUNCTION IF EXISTS public.clear_site_template_defaults(p_site_id UUID);

-- Create the updated function with support for split image templates
CREATE OR REPLACE FUNCTION public.update_site_template_defaults(
  p_site_id UUID,
  p_submission_defaults JSONB,
  p_petri_defaults JSONB,
  p_gasifier_defaults JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_petri_item JSONB;
  v_site_program_id UUID;
  v_user_id UUID;
BEGIN
  -- Get the current user ID
  v_user_id := auth.uid();

  -- Verify site exists and the user has permission to update it
  SELECT program_id INTO v_site_program_id FROM sites WHERE site_id = p_site_id;
  
  IF v_site_program_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Site not found'
    );
  END IF;
  
  -- Verify user has access to program with appropriate role
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users 
    WHERE program_id = v_site_program_id 
    AND user_id = v_user_id 
    AND role IN ('Admin', 'Edit')
  ) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'You do not have permission to update this site'
    );
  END IF;

  -- Validate the submission defaults
  IF p_submission_defaults IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Submission defaults cannot be null'
    );
  END IF;

  -- Validate petri defaults if provided
  IF p_petri_defaults IS NOT NULL THEN
    -- Check that it's an array
    IF jsonb_typeof(p_petri_defaults) != 'array' THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'message', 'Petri defaults must be an array'
      );
    END IF;
    
    -- Validate each petri template
    FOR v_petri_item IN SELECT * FROM jsonb_array_elements(p_petri_defaults)
    LOOP
      -- Check for required fields
      IF v_petri_item->>'petri_code' IS NULL OR
         v_petri_item->>'fungicide_used' IS NULL OR
         v_petri_item->>'surrounding_water_schedule' IS NULL THEN
        RETURN jsonb_build_object(
          'success', FALSE,
          'message', 'Each petri template must have petri_code, fungicide_used, and surrounding_water_schedule'
        );
      END IF;
      
      -- Validate split image configuration if present
      IF (v_petri_item->>'is_split_image_template')::BOOLEAN IS TRUE THEN
        -- Check if split_codes is provided and is an array with at least 2 elements
        IF v_petri_item->'split_codes' IS NULL OR 
           jsonb_typeof(v_petri_item->'split_codes') != 'array' OR
           jsonb_array_length(v_petri_item->'split_codes') < 2 THEN
          RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Split image templates must include split_codes array with at least 2 elements'
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Update the site with the new template defaults
  UPDATE sites
  SET 
    submission_defaults = p_submission_defaults,
    petri_defaults = p_petri_defaults,
    gasifier_defaults = p_gasifier_defaults,
    lastupdated_by = v_user_id
  WHERE site_id = p_site_id;

  -- Return success message
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Site template updated successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.update_site_template_defaults TO authenticated;

-- Add comment to function
COMMENT ON FUNCTION public.update_site_template_defaults IS 'Updates site template defaults for submissions, petri observations, and gasifier observations with support for split image configuration.';

-- Also update the clear_site_template_defaults function to ensure compatibility
CREATE OR REPLACE FUNCTION public.clear_site_template_defaults(
  p_site_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_site_program_id UUID;
  v_user_id UUID;
BEGIN
  -- Get the current user ID
  v_user_id := auth.uid();

  -- Verify site exists and the user has permission to update it
  SELECT program_id INTO v_site_program_id FROM sites WHERE site_id = p_site_id;
  
  IF v_site_program_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Site not found'
    );
  END IF;
  
  -- Verify user has access to program with appropriate role
  IF NOT EXISTS (
    SELECT 1 FROM pilot_program_users 
    WHERE program_id = v_site_program_id 
    AND user_id = v_user_id 
    AND role IN ('Admin', 'Edit')
  ) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'You do not have permission to update this site'
    );
  END IF;

  -- Clear the template defaults
  UPDATE sites
  SET 
    submission_defaults = NULL,
    petri_defaults = NULL,
    gasifier_defaults = NULL,
    lastupdated_by = v_user_id
  WHERE site_id = p_site_id;

  -- Return success message
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Site template cleared successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.clear_site_template_defaults TO authenticated;

-- Add comment to function
COMMENT ON FUNCTION public.clear_site_template_defaults IS 'Clears all template defaults for a site.';