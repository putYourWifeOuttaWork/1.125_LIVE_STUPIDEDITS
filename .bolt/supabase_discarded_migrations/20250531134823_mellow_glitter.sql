-- Fix user profile registration and update functions
-- This migration updates the trigger functions to properly handle full_name

-- 1. Update the function for new users to include full_name
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, company)
  VALUES (
    NEW.id, 
    NEW.email, 
    NEW.raw_user_meta_data->>'full_name', 
    NEW.raw_user_meta_data->>'company'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update the function for user updates to include full_name
CREATE OR REPLACE FUNCTION handle_user_update() 
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users
  SET email = NEW.email,
      full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', users.full_name),
      company = COALESCE(NEW.raw_user_meta_data->>'company', users.company)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Run a one-time update to fix existing users that might have full_name in metadata but not in the users table
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN 
    SELECT au.id, au.raw_user_meta_data->>'full_name' as full_name
    FROM auth.users au
    JOIN public.users pu ON au.id = pu.id
    WHERE au.raw_user_meta_data->>'full_name' IS NOT NULL
    AND (pu.full_name IS NULL OR pu.full_name = '')
  LOOP
    UPDATE public.users
    SET full_name = user_record.full_name
    WHERE id = user_record.id;
  END LOOP;
END $$;