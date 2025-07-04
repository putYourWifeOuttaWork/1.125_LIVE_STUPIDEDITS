/*
  # Allow NULL image_url in observations tables
  
  1. Changes
    - Alters petri_observations and gasifier_observations tables to allow NULL in image_url column
    - Ensures create_submission_session can insert template records without images
    
  2. Purpose
    - Fixes the error when creating new submissions from templates
    - Allows observation records to exist without images initially
*/

-- Alter petri_observations table to allow NULL image_url
ALTER TABLE petri_observations 
ALTER COLUMN image_url DROP NOT NULL;

-- Alter gasifier_observations table to allow NULL image_url
ALTER TABLE gasifier_observations 
ALTER COLUMN image_url DROP NOT NULL;

COMMENT ON COLUMN petri_observations.image_url IS 'URL to the petri dish image, can be NULL initially when created from template';
COMMENT ON COLUMN gasifier_observations.image_url IS 'URL to the gasifier image, can be NULL initially when created from template';