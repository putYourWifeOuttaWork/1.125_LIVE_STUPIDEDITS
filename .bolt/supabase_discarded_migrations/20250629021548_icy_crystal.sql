/*
  # Implement Split Petri Observations Support
  
  1. Changes
    - Add main_petri_id column to petri_observations to link split records
    - Add is_split_source column to identify the source record with original image
    - Add split_processed column to track processing state
    - Create new split_petri_images table for archiving original images
    - Add RPC function for the Python app to call when processing is complete
    
  2. Purpose
    - Support the revised approach for split petri observations
    - Allow single image upload in frontend with backend image splitting
    - Enable tracking and archiving of original images
*/

-- Step 1: Add new columns to petri_observations
ALTER TABLE public.petri_observations 
  ADD COLUMN IF NOT EXISTS main_petri_id UUID REFERENCES public.petri_observations(observation_id),
  ADD COLUMN IF NOT EXISTS is_split_source BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS split_processed BOOLEAN DEFAULT FALSE;

-- Add comments to explain the purpose of each new column
COMMENT ON COLUMN public.petri_observations.main_petri_id IS 'Links the left and right split records to their main source record';
COMMENT ON COLUMN public.petri_observations.is_split_source IS 'Identifies the source record that holds the original, unsplit image';
COMMENT ON COLUMN public.petri_observations.split_processed IS 'Indicates whether the image splitting process has been completed';

-- Step 2: Create an index on main_petri_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_petri_observations_main_petri_id
  ON public.petri_observations(main_petri_id);

-- Step 3: Create the split_petri_images table for archiving original images
CREATE TABLE IF NOT EXISTS public.split_petri_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_image_url TEXT NOT NULL,
  main_petri_observation_id UUID NOT NULL REFERENCES public.petri_observations(observation_id),
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed_by_user_id UUID REFERENCES auth.users(id)
);

-- Add comments to the table and columns
COMMENT ON TABLE public.split_petri_images IS 'Archives original images from split petri observations';
COMMENT ON COLUMN public.split_petri_images.original_image_url IS 'URL of the original, unsplit image';
COMMENT ON COLUMN public.split_petri_images.main_petri_observation_id IS 'Reference to the source petri observation';
COMMENT ON COLUMN public.split_petri_images.archived_at IS 'When the image was archived';
COMMENT ON COLUMN public.split_petri_images.processed_by_user_id IS 'User who processed the split';

-- Enable RLS on the new table
ALTER TABLE public.split_petri_images ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Anyone can view split_petri_images"
  ON public.split_petri_images
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can insert split_petri_images"
  ON public.split_petri_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM petri_observations po
      JOIN sites s ON po.site_id = s.site_id
      JOIN pilot_program_users ppu ON s.program_id = ppu.program_id
      WHERE po.observation_id = main_petri_observation_id
      AND ppu.user_id = auth.uid()
      AND ppu.role IN ('Admin', 'Edit')
    )
  );

-- Step 4: Create a function for the Python app to call when processing is complete
CREATE OR REPLACE FUNCTION public.complete_petri_split_processing(
  p_main_petri_id UUID,
  p_left_image_url TEXT,
  p_right_image_url TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_main_record public.petri_observations;
  v_left_record_id UUID;
  v_right_record_id UUID;
  v_original_image_url TEXT;
  v_result JSONB;
BEGIN
  -- Get the main petri record
  SELECT * INTO v_main_record 
  FROM public.petri_observations
  WHERE observation_id = p_main_petri_id AND is_split_source = TRUE;
  
  IF v_main_record IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Main petri observation not found or not a split source'
    );
  END IF;
  
  -- Store the original image URL before updating
  v_original_image_url := v_main_record.image_url;
  
  -- Get the left and right record IDs
  SELECT observation_id INTO v_left_record_id
  FROM public.petri_observations
  WHERE main_petri_id = p_main_petri_id
  AND (phase_observation_settings->>'position') = 'left';
  
  SELECT observation_id INTO v_right_record_id
  FROM public.petri_observations
  WHERE main_petri_id = p_main_petri_id
  AND (phase_observation_settings->>'position') = 'right';
  
  IF v_left_record_id IS NULL OR v_right_record_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Split petri observations not found'
    );
  END IF;
  
  -- Update the left record with its new image URL
  UPDATE public.petri_observations
  SET image_url = p_left_image_url,
      last_updated_by_user_id = auth.uid()
  WHERE observation_id = v_left_record_id;
  
  -- Update the right record with its new image URL
  UPDATE public.petri_observations
  SET image_url = p_right_image_url,
      last_updated_by_user_id = auth.uid()
  WHERE observation_id = v_right_record_id;
  
  -- Mark the main record as processed
  UPDATE public.petri_observations
  SET split_processed = TRUE,
      last_updated_by_user_id = auth.uid()
  WHERE observation_id = p_main_petri_id;
  
  -- Archive the original image
  INSERT INTO public.split_petri_images (
    original_image_url,
    main_petri_observation_id,
    processed_by_user_id
  ) VALUES (
    v_original_image_url,
    p_main_petri_id,
    auth.uid()
  );
  
  -- Return success
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Split petri processing completed successfully',
    'left_observation_id', v_left_record_id,
    'right_observation_id', v_right_record_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Error completing split processing: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.complete_petri_split_processing TO authenticated;

-- Add comment to function
COMMENT ON FUNCTION public.complete_petri_split_processing IS 'Called by the Python app to update split petri records with their individual images and mark processing as complete';

-- Step 5: Create a modified version of the create_submission_session function that supports the new approach
CREATE OR REPLACE FUNCTION public.create_submission_session_with_split_petri(
  p_site_id UUID,
  p_program_id UUID,
  p_submission_data JSONB,
  p_petri_templates JSONB DEFAULT NULL,
  p_gasifier_templates JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_submission_id UUID;
  v_session_id UUID;
  v_petri_observation_id UUID;
  v_left_observation_id UUID;
  v_right_observation_id UUID;
  v_gasifier_observation_id UUID;
  v_result JSONB;
  v_petri_template JSONB;
  v_gasifier_template JSONB;
  v_user_id UUID;
  v_base_petri_code TEXT;
  v_left_code TEXT;
  v_right_code TEXT;
BEGIN
  -- Get the current user ID
  v_user_id := auth.uid();

  -- Create the submission
  INSERT INTO submissions (
    site_id,
    program_id,
    temperature,
    humidity,
    airflow,
    odor_distance,
    weather,
    notes,
    created_by,
    indoor_temperature,
    indoor_humidity,
    submission_timezone
  )
  VALUES (
    p_site_id,
    p_program_id,
    (p_submission_data->>'temperature')::NUMERIC,
    (p_submission_data->>'humidity')::NUMERIC,
    (p_submission_data->>'airflow')::airflow_enum,
    (p_submission_data->>'odor_distance')::odor_distance_enum,
    (p_submission_data->>'weather')::weather_enum,
    p_submission_data->>'notes',
    v_user_id,
    (p_submission_data->>'indoor_temperature')::NUMERIC,
    (p_submission_data->>'indoor_humidity')::NUMERIC,
    p_submission_data->>'timezone'
  )
  RETURNING submission_id INTO v_submission_id;

  -- Create the submission session
  INSERT INTO submission_sessions (
    submission_id,
    site_id,
    program_id,
    opened_by_user_id,
    session_status
  )
  VALUES (
    v_submission_id,
    p_site_id,
    p_program_id,
    v_user_id,
    'Opened'
  )
  RETURNING session_id INTO v_session_id;

  -- Create petri observations from templates if provided
  IF p_petri_templates IS NOT NULL AND jsonb_array_length(p_petri_templates) > 0 THEN
    FOR v_petri_template IN SELECT * FROM jsonb_array_elements(p_petri_templates)
    LOOP
      -- Check if this is a split image template
      IF (v_petri_template->>'is_split_image_template')::BOOLEAN IS TRUE THEN
        -- Get the base petri code and the split codes
        v_base_petri_code := v_petri_template->>'petri_code';
        v_left_code := jsonb_array_element_text(v_petri_template->'split_codes', 0);
        v_right_code := jsonb_array_element_text(v_petri_template->'split_codes', 1);
        
        -- If we don't have both codes, use defaults based on the original code
        IF v_left_code IS NULL OR v_right_code IS NULL THEN
          v_left_code := v_base_petri_code || '_Left';
          v_right_code := v_base_petri_code || '_Right';
        END IF;

        -- Create the MAIN petri observation record that will hold the original image
        INSERT INTO petri_observations (
          submission_id,
          site_id,
          petri_code,
          plant_type,
          fungicide_used,
          surrounding_water_schedule,
          placement,
          placement_dynamics,
          notes,
          is_image_split,
          is_split_source,
          split_processed,
          phase_observation_settings
        )
        VALUES (
          v_submission_id,
          p_site_id,
          v_base_petri_code, -- Use the base code (without Left/Right)
          (v_petri_template->>'plant_type')::plant_type_enum,
          (v_petri_template->>'fungicide_used')::fungicide_used_enum,
          (v_petri_template->>'surrounding_water_schedule')::water_schedule_enum,
          (v_petri_template->>'placement')::petri_placement_enum,
          (v_petri_template->>'placement_dynamics')::petri_placement_dynamics_enum,
          v_petri_template->>'notes',
          TRUE,
          TRUE, -- This is the source record
          FALSE, -- Not processed yet
          jsonb_build_object(
            'base_petri_code', v_base_petri_code,
            'position', 'main',
            'left_code', v_left_code,
            'right_code', v_right_code
          )
        )
        RETURNING observation_id INTO v_petri_observation_id;
        
        -- Create the LEFT petri observation record
        INSERT INTO petri_observations (
          submission_id,
          site_id,
          petri_code,
          plant_type,
          fungicide_used,
          surrounding_water_schedule,
          placement,
          placement_dynamics,
          notes,
          is_image_split,
          main_petri_id,
          phase_observation_settings
        )
        VALUES (
          v_submission_id,
          p_site_id,
          v_left_code,
          (v_petri_template->>'plant_type')::plant_type_enum,
          (v_petri_template->>'fungicide_used')::fungicide_used_enum,
          (v_petri_template->>'surrounding_water_schedule')::water_schedule_enum,
          (v_petri_template->>'placement')::petri_placement_enum,
          (v_petri_template->>'placement_dynamics')::petri_placement_dynamics_enum,
          v_petri_template->>'notes',
          TRUE,
          v_petri_observation_id, -- Link to the main record
          jsonb_build_object(
            'base_petri_code', v_base_petri_code,
            'position', 'left',
            'left_code', v_left_code,
            'right_code', v_right_code
          )
        )
        RETURNING observation_id INTO v_left_observation_id;
        
        -- Create the RIGHT petri observation record
        INSERT INTO petri_observations (
          submission_id,
          site_id,
          petri_code,
          plant_type,
          fungicide_used,
          surrounding_water_schedule,
          placement,
          placement_dynamics,
          notes,
          is_image_split,
          main_petri_id,
          phase_observation_settings
        )
        VALUES (
          v_submission_id,
          p_site_id,
          v_right_code,
          (v_petri_template->>'plant_type')::plant_type_enum,
          (v_petri_template->>'fungicide_used')::fungicide_used_enum,
          (v_petri_template->>'surrounding_water_schedule')::water_schedule_enum,
          (v_petri_template->>'placement')::petri_placement_enum,
          (v_petri_template->>'placement_dynamics')::petri_placement_dynamics_enum,
          v_petri_template->>'notes',
          TRUE,
          v_petri_observation_id, -- Link to the main record
          jsonb_build_object(
            'base_petri_code', v_base_petri_code,
            'position', 'right',
            'left_code', v_left_code,
            'right_code', v_right_code
          )
        )
        RETURNING observation_id INTO v_right_observation_id;
        
      ELSE
        -- Normal non-split petri observation
        INSERT INTO petri_observations (
          submission_id,
          site_id,
          petri_code,
          plant_type,
          fungicide_used,
          surrounding_water_schedule,
          placement,
          placement_dynamics,
          notes
        )
        VALUES (
          v_submission_id,
          p_site_id,
          v_petri_template->>'petri_code',
          (v_petri_template->>'plant_type')::plant_type_enum,
          (v_petri_template->>'fungicide_used')::fungicide_used_enum,
          (v_petri_template->>'surrounding_water_schedule')::water_schedule_enum,
          (v_petri_template->>'placement')::petri_placement_enum,
          (v_petri_template->>'placement_dynamics')::petri_placement_dynamics_enum,
          v_petri_template->>'notes'
        );
      END IF;
    END LOOP;
  END IF;

  -- Create gasifier observations from templates if provided
  IF p_gasifier_templates IS NOT NULL AND jsonb_array_length(p_gasifier_templates) > 0 THEN
    FOR v_gasifier_template IN SELECT * FROM jsonb_array_elements(p_gasifier_templates)
    LOOP
      INSERT INTO gasifier_observations (
        submission_id,
        site_id,
        gasifier_code,
        chemical_type,
        placement_height,
        directional_placement,
        placement_strategy,
        notes
      )
      VALUES (
        v_submission_id,
        p_site_id,
        v_gasifier_template->>'gasifier_code',
        (v_gasifier_template->>'chemical_type')::chemical_type_enum,
        (v_gasifier_template->>'placement_height')::placement_height_enum,
        (v_gasifier_template->>'directional_placement')::directional_placement_enum,
        (v_gasifier_template->>'placement_strategy')::placement_strategy_enum,
        v_gasifier_template->>'notes'
      );
    END LOOP;
  END IF;

  -- Build the result object
  v_result := jsonb_build_object(
    'success', TRUE,
    'submission_id', v_submission_id,
    'session_id', v_session_id
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.create_submission_session_with_split_petri TO authenticated;

-- Add comment to function
COMMENT ON FUNCTION public.create_submission_session_with_split_petri IS 'Creates a submission and session with support for the new split petri observation approach where one source record holds the original image and two linked records will receive the split images';

-- Create a webhook to notify the Python app when a petri observation is updated with an image
-- This is a placeholder for the actual webhook implementation
-- In a real deployment, this would be implemented in Supabase Edge Functions or an external service
COMMENT ON TABLE public.petri_observations IS 'Stores petri images and observations per submission. To implement split image processing, create a webhook or Edge Function that triggers when a petri_observation with is_split_source=TRUE is updated with an image_url.';