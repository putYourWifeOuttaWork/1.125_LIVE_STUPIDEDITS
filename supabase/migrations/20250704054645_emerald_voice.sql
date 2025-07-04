/*
  # Add Program Phase Fields to petri_observations Table
  
  1. Changes
    - Add daysInThisProgramPhase and todays_day_of_phase columns to the petri_observations table
    - Set default values to 1 to avoid division by zero errors
    
  2. Purpose
    - Fix "column does not exist" error in create_submission_session function
    - Enable proper tracking of program phase progress for petri observations
    - Maintain consistency with gasifier_observations table structure
*/

-- Add the columns to petri_observations if they don't exist
ALTER TABLE petri_observations 
  ADD COLUMN IF NOT EXISTS daysInThisProgramPhase numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS todays_day_of_phase numeric DEFAULT 1;

-- Add comments to explain the purpose of these columns
COMMENT ON COLUMN petri_observations.daysInThisProgramPhase IS 'Total number of days in the program phase (from program phases data)';
COMMENT ON COLUMN petri_observations.todays_day_of_phase IS 'Current day number within the program phase, starting from 1';

-- Update any existing petri observations to have valid values
UPDATE petri_observations
SET 
  daysInThisProgramPhase = 1,
  todays_day_of_phase = 1
WHERE 
  daysInThisProgramPhase IS NULL OR daysInThisProgramPhase = 0 OR
  todays_day_of_phase IS NULL OR todays_day_of_phase = 0;