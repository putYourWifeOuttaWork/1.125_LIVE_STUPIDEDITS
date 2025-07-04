/*
  # Add Image Splitting Support for Petri Observations
  
  1. New Features
    - Add is_image_split flag to petri_observations to indicate split images
    - Add phase_observation_settings JSONB to store split image configurations
    - Add is_missed_observation flag to identify imputed data points
    
  2. Purpose
    - Enable a single image to be split into two petri observations
    - Allow template-based configuration of split image petri codes
    - Support tracking of observations generated through imputation
*/

-- Add new columns to petri_observations table
ALTER TABLE public.petri_observations 
  ADD COLUMN IF NOT EXISTS is_image_split BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phase_observation_settings JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_missed_observation BOOLEAN DEFAULT FALSE;

-- Add comments to explain the purpose of each new column
COMMENT ON COLUMN public.petri_observations.is_image_split IS 'Indicates if this petri observation is part of a split image (2 petris in 1 photo)';
COMMENT ON COLUMN public.petri_observations.phase_observation_settings IS 'JSONB object containing split image settings like left/right petri codes';
COMMENT ON COLUMN public.petri_observations.is_missed_observation IS 'Flag indicating this observation was created through imputation for a missed data point';

-- Create a view to provide phase information for petri observations
CREATE OR REPLACE VIEW petri_observations_with_phase_info AS
SELECT 
  p.*,
  s.created_at AS submission_date,
  pp.phases,
  -- Calculate which day of the program this observation was made on
  (DATE(s.created_at) - pp.start_date + 1) AS day_of_program,
  -- Extract phase information if available
  CASE 
    WHEN pp.phases IS NOT NULL AND jsonb_array_length(pp.phases) > 0 THEN
      (SELECT jsonb_agg(
        jsonb_build_object(
          'phase_number', phase->>'phase_number',
          'phase_type', phase->>'phase_type',
          'label', phase->>'label'
        )
      )
      FROM jsonb_array_elements(pp.phases) phase
      WHERE 
        (phase->>'start_date')::date <= DATE(s.created_at) AND
        (phase->>'end_date')::date >= DATE(s.created_at)
      )
    ELSE NULL
  END AS current_phase
FROM 
  public.petri_observations p
JOIN
  public.submissions s ON p.submission_id = s.submission_id
JOIN
  public.pilot_programs pp ON p.program_id = pp.program_id;

-- Grant permissions for the view
GRANT SELECT ON petri_observations_with_phase_info TO authenticated;

-- Add comments to the view
COMMENT ON VIEW petri_observations_with_phase_info IS 'View that extends petri_observations with phase information';
COMMENT ON COLUMN petri_observations_with_phase_info.day_of_program IS 'The day number within the program when this observation was made';
COMMENT ON COLUMN petri_observations_with_phase_info.current_phase IS 'Information about which program phase this observation belongs to';