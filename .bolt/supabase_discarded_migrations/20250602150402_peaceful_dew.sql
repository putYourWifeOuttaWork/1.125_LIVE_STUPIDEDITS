/*
  # Add company-logos storage bucket
  
  1. Changes
    - Creates a new storage bucket for company logos
    - Adds proper security function for company logo access control
    
  2. Security
    - Public access for viewing company logos
    - Company admins can manage their company's logos
*/

-- Create the company-logos bucket with proper settings
DO $$
BEGIN
  INSERT INTO storage.buckets (
    id, 
    name, 
    public,
    file_size_limit,
    allowed_mime_types
  )
  VALUES (
    'company-logos',
    'Company Logos',
    TRUE, -- public access enabled
    5242880, -- 5MB file size limit
    ARRAY['image/jpeg', 'image/png', 'image/gif']::text[] -- allowed mime types
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Create a helper function for company logo access control
CREATE OR REPLACE FUNCTION public.can_manage_company_logo(company_id_param UUID)
RETURNS boolean AS $$
BEGIN
  -- Check if the user is an admin for the specified company
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() 
    AND company_id = company_id_param
    AND is_company_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.can_manage_company_logo(UUID) TO authenticated;

-- Add a comment to explain how to set up RLS in the Dashboard
COMMENT ON FUNCTION public.can_manage_company_logo IS 
'Function for checking if a user can manage a company logo. 
Use this in storage RLS policies for the company-logos bucket.

Example RLS policy configuration through the Dashboard:
- SELECT policy: bucket_id = ''company-logos'' (for public viewing)
- INSERT policy: bucket_id = ''company-logos'' AND auth.uid() IS NOT NULL AND (SELECT can_manage_company_logo(<company_id>))
- UPDATE/DELETE: Same as INSERT';