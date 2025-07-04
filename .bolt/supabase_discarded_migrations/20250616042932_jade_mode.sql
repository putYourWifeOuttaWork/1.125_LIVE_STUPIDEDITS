/*
  # Fix Audit Log RLS Policy
  
  1. Changes
    - Drop the existing policy for pilot_program_history
    - Create a new policy that restricts access based on the company_id
    - Ensure users can only see audit logs for programs from their own company
  
  2. Purpose
    - Fix the security issue where users in Company X can see audit logs for programs in Company Y
    - Maintain proper data isolation between companies
    - Follow the principle of least privilege
*/

-- Drop the existing policy for viewing history
DROP POLICY IF EXISTS "Users can view history for their programs" ON pilot_program_history;

-- Create a new, more restrictive policy that checks company_id
CREATE POLICY "Users can view history for their company's programs" ON pilot_program_history
  FOR SELECT
  USING (
    -- Check if the program belongs to the user's company
    program_id IN (
      SELECT pp.program_id
      FROM pilot_programs pp
      JOIN users u ON pp.company_id = u.company_id
      WHERE u.id = auth.uid() AND u.company_id IS NOT NULL
    )
  );

-- Add comments for documentation
COMMENT ON POLICY "Users can view history for their company's programs" ON pilot_program_history IS 
  'Allows users to view history only for programs that belong to their company';