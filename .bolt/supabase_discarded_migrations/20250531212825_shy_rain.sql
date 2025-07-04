-- Additional Auth Settings for Email Confirmation
-- This migration updates user permissions and adds super admin users

-- Add a super admin user for the initial setup
-- Make sure at least one user has super admin rights to manage the application
UPDATE public.users
SET is_super_admin = TRUE
WHERE email = 'admin@grmtek.com'
OR email LIKE '%@grmtek.com';

-- Note: The following auth settings cannot be configured directly through SQL migrations
-- as the auth.config table doesn't exist in this Supabase instance.
-- 
-- These settings need to be configured through the Supabase Dashboard:
--
-- 1. Go to Authentication > Settings > Email Auth
-- 2. Set "Confirm email" to "Enabled" to require email confirmation
-- 3. Set confirmation token expiration to 24 hours
-- 4. Configure the Site URL to https://sporeless.grmtek.com
-- 5. Set the redirect URL after confirmation
--
-- For JWT settings:
-- 1. Go to Authentication > Settings > JWT Settings
-- 2. Set JWT expiry to 604800 (7 days)
-- 3. Set refresh token expiry to 2592000 (30 days)
--
-- This migration will only handle the super admin user setup.
-- The remaining auth configuration needs to be done via the Supabase dashboard.

-- Add is_super_admin column to users table if it doesn't exist yet
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'is_super_admin'
    ) THEN
        ALTER TABLE public.users ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE;
    END IF;
END
$$;