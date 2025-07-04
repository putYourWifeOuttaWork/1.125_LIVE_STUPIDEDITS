/*
  # Add index for created_by on submissions

  1. Changes
    - Add an index on created_by column in submissions table
    - This improves performance when querying submissions by user
*/

-- Create index on created_by column
CREATE INDEX IF NOT EXISTS submissions_created_by_idx ON submissions (created_by);

-- Update existing submissions to set created_by if null
UPDATE submissions 
SET created_by = pilot_program_users.user_id
FROM pilot_program_users 
WHERE submissions.created_by IS NULL 
AND submissions.program_id = pilot_program_users.program_id 
AND pilot_program_users.role = 'Edit';