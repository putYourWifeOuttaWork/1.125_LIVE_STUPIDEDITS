-- Allow NULL image_url in observations tables

-- Alter petri_observations table to allow NULL image_url
ALTER TABLE petri_observations 
ALTER COLUMN image_url DROP NOT NULL;

-- Alter gasifier_observations table to allow NULL image_url
ALTER TABLE gasifier_observations 
ALTER COLUMN image_url DROP NOT NULL;

COMMENT ON COLUMN petri_observations.image_url IS 'URL to the petri dish image, can be NULL initially when created from template';
COMMENT ON COLUMN gasifier_observations.image_url IS 'URL to the gasifier image, can be NULL initially when created from template';