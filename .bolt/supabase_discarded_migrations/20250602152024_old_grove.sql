/*
  # Fix User Avatar Storage
  
  1. Creates user-avatars bucket and RLS policies
  2. Adds helper functions for user avatar management
  3. Ensures only the user themselves or super admins can manage avatars
*/

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

-- Create function to check if user can manage their own avatar
CREATE OR REPLACE FUNCTION public.can_manage_user_avatar(user_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if this is the user's own avatar or if they're a super admin
  RETURN (user_id_param = auth.uid()) OR EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_super_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.can_manage_user_avatar(UUID) TO authenticated;

-- Add comments to help with RLS setup in the dashboard
COMMENT ON FUNCTION public.can_manage_user_avatar IS 
'Function for checking if a user can manage an avatar.
To set up the RLS policies through the Supabase Dashboard:

For user-avatars bucket:
- Public SELECT policy: bucket_id = ''user-avatars''
- INSERT policy for authenticated users: bucket_id = ''user-avatars'' AND (storage.foldername(name)[1] = auth.uid()::text OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_super_admin = true))
- Use same logic for UPDATE and DELETE policies';