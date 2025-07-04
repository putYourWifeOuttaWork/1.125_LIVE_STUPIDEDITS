/*
  # Make opened_by_user_id nullable in submission_sessions
  
  1. Changes
    - Modifies the opened_by_user_id column to be nullable
    - Updates the column comment to explain unclaimed sessions
    
  2. Purpose
    - Enables auto-created sessions that aren't claimed by any user yet
    - Allows the system to create sessions that users can claim later
*/

-- Modify the opened_by_user_id column to allow NULL
ALTER TABLE submission_sessions ALTER COLUMN opened_by_user_id DROP NOT NULL;

-- Update the comment to explain unclaimed sessions
COMMENT ON COLUMN submission_sessions.opened_by_user_id IS 'The user who started or claimed this session. NULL for auto-created, unclaimed sessions.';