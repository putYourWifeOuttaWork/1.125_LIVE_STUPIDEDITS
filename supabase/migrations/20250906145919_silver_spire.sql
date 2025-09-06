/*
  # Add new indoor humidity column to fix data corruption issue

  1. New Columns
    - `indoor_humidity_new` (numeric(5,2), nullable) - New column for indoor humidity to bypass trigger issues
  
  2. Changes
    - Add new column to submissions table with same constraints as existing indoor_humidity column
    - This allows us to migrate away from the problematic indoor_humidity column that's being overwritten by database triggers

  3. Migration Strategy
    - Add the new column alongside the existing one
    - Application code will be updated to use the new column
    - Old column remains for backward compatibility and data preservation
*/

-- Add the new indoor humidity column to submissions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'indoor_humidity_new'
  ) THEN
    ALTER TABLE submissions ADD COLUMN indoor_humidity_new numeric(5,2);
  END IF;
END $$;

-- Add the same constraints as the existing indoor_humidity column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'submissions_indoor_humidity_new_check'
  ) THEN
    ALTER TABLE submissions ADD CONSTRAINT submissions_indoor_humidity_new_check 
    CHECK ((indoor_humidity_new >= 1 AND indoor_humidity_new <= 100));
  END IF;
END $$;