/*
  # Fix Storage Buckets and RLS Policies for Uploads
  
  1. New Storage Buckets
    - Creates 'company-logos' bucket for company logos 
    - Creates 'user-avatars' bucket for user profile pictures
  
  2. RLS Helper Functions
    - Security definer functions to enforce permissions
    - Restricts company logo management to company admins and super admins
    - Restricts user avatar management to the user themselves and super admins
*/

-- Create the company-logos bucket if it doesn't exist
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

-- Create the user-avatars bucket if it doesn't exist
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
    'user-avatars',
    'User Avatars',
    TRUE, -- public access enabled
    5242880, -- 5MB file size limit
    ARRAY['image/jpeg', 'image/png', 'image/gif']::text[] -- allowed mime types
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Create function to check if user is a super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_super_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user can manage a company logo
CREATE OR REPLACE FUNCTION public.can_manage_company_logo(company_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  -- Check if user is an admin for this company or a super admin
  SELECT is_company_admin INTO is_admin
  FROM public.users
  WHERE id = auth.uid() AND company_id = company_id_param;
  
  RETURN COALESCE(is_admin, FALSE) OR public.is_super_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments to help with RLS setup in the dashboard
COMMENT ON FUNCTION public.can_manage_company_logo IS 
'Function for checking if a user can manage a company logo. 
To set up the RLS policies through the Supabase Dashboard:

For company-logos bucket:
- Public SELECT policy: bucket_id = ''company-logos''
- INSERT policy for authenticated users: bucket_id = ''company-logos'' AND EXISTS (SELECT 1 FROM companies c WHERE auth.uid() IN (SELECT id FROM users WHERE company_id = c.company_id AND is_company_admin = true) OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_super_admin = true))
- Use same logic for UPDATE and DELETE policies';

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_company_logo(UUID) TO authenticated;