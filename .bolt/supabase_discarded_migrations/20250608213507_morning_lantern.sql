/*
  # Add Company Members Visibility Policy
  
  1. New Policy
    - Allows users to view other users who belong to the same company
    - Ensures both the viewer and viewed user have a non-null company_id
    - Enables fetchCompanyUsers to work properly in the UI
    
  2. Purpose
    - Fixes "Failed to fetch" error in SiteTemplateManagementPage
    - Allows displaying admin contact information
*/

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