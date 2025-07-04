-- Add policy to allow users to view other users in their company
CREATE POLICY "Users can view company members"
  ON users
  FOR SELECT
  TO public
  USING (
    company_id IS NOT NULL 
    AND company_id IN (
      SELECT company_id 
      FROM users 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    )
  );